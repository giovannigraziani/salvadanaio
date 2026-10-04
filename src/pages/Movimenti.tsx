import { useMemo, useState, type ReactNode } from 'react';
import { formatEuro, sum } from '../domain/money';
import { currentMonth, dateLabel, monthOfDate } from '../domain/month';
import type { Category, MonthKey, Transaction } from '../domain/types';
import { useData } from '../store/store';
import { CategoryDot, MonthSwitcher, Segmented } from '../ui/components';
import { Icon } from '../ui/icons';
import { useOpenTransaction } from '../ui/quickAdd';
import { navigate } from '../ui/router';

type Kind = 'tutte' | 'pianificate' | 'estemporanee';

export function Movimenti({ month = currentMonth() }: { month?: MonthKey }) {
  const data = useData();
  const openTransaction = useOpenTransaction();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Spese</h1>
          <p>Tutto quello che hai speso davvero, pianificato o no.</p>
        </div>
        <MonthSwitcher month={month} onChange={(m) => navigate(`movimenti/${m}`)} />
      </div>
      <TransactionsBrowser
        transactions={data.movimenti}
        categorie={data.categorie}
        month={month}
        onOpen={(t) => openTransaction(t, 'personale')}
        onAdd={(partial) => openTransaction(partial, 'personale')}
      />
    </>
  );
}

/** Elenco filtrabile delle spese di un mese, raggruppate per giorno. */
export function TransactionsBrowser<T extends Transaction>({
  transactions,
  categorie,
  month,
  onOpen,
  onAdd,
  badge,
}: {
  transactions: T[];
  categorie: Category[];
  month: MonthKey;
  onOpen: (t: T) => void;
  onAdd: (partial: Partial<T>) => void;
  /** Etichetta aggiuntiva per riga (es. chi ha pagato). */
  badge?: (t: T) => ReactNode;
}) {
  const [kind, setKind] = useState<Kind>('tutte');
  const [categoria, setCategoria] = useState('');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions
      .filter((t) => monthOfDate(t.data) === month)
      .filter((t) => (kind === 'pianificate' ? !!t.previstaId : kind === 'estemporanee' ? !t.previstaId : true))
      .filter((t) => !categoria || t.categoriaId === categoria)
      .filter((t) => !q || t.descrizione.toLowerCase().includes(q) || t.note?.toLowerCase().includes(q))
      .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
  }, [transactions, month, kind, categoria, query]);

  const byDay = new Map<string, T[]>();
  for (const t of filtered) byDay.set(t.data, [...(byDay.get(t.data) ?? []), t]);
  const categories = new Map(categorie.map((c) => [c.id, c]));

  return (
    <div className="card">
      <div className="actions" style={{ marginBottom: 14 }}>
        <Segmented<Kind>
          label="Tipo di spesa"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'tutte', label: 'Tutte' },
            { value: 'pianificate', label: 'Pianificate' },
            { value: 'estemporanee', label: 'Estemporanee' },
          ]}
        />
        <select className="input compact" style={{ width: 'auto' }} value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Filtra per categoria">
          <option value="">Tutte le categorie</option>
          {categorie.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <input className="input compact" style={{ width: 'auto', flex: '1 1 160px' }} placeholder="Cerca…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cerca" />
      </div>

      <div className="split" style={{ marginBottom: 8 }}>
        <span className="muted small">
          {filtered.length} {filtered.length === 1 ? 'spesa' : 'spese'}
        </span>
        <strong>Totale {formatEuro(sum(filtered, (t) => t.importo))}</strong>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <p>Nessuna spesa {kind !== 'tutte' || categoria || query ? 'con questi filtri' : 'registrata in questo mese'}.</p>
          <button type="button" className="btn primary" onClick={() => onAdd((month === currentMonth() ? {} : { data: `${month}-01` }) as Partial<T>)}>
            <Icon name="plus" /> Registra una spesa
          </button>
        </div>
      ) : (
        [...byDay.entries()].map(([day, items]) => (
          <section key={day} style={{ marginTop: 10 }}>
            <div className="split small muted" style={{ borderBottom: '1px solid var(--axis)', paddingBottom: 4 }}>
              <strong>{dateLabel(day)}</strong>
              <span>{formatEuro(sum(items, (t) => t.importo))}</span>
            </div>
            <ul className="list">
              {items.map((t) => {
                const c = categories.get(t.categoriaId);
                return (
                  <li key={t.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => onOpen(t)}>
                    <CategoryDot color={c?.colore ?? 'var(--axis)'} />
                    <div className="grow">
                      <div className="title">{t.descrizione}</div>
                      <div className="sub">
                        {c?.nome ?? 'Senza categoria'}
                        {t.note ? ` · ${t.note}` : ''}
                      </div>
                    </div>
                    {badge?.(t)}
                    <span className="hide-mobile">
                      {t.previstaId ? <span className="badge accent">pianificata</span> : <span className="badge">estemporanea</span>}
                    </span>
                    <strong className="num">{formatEuro(t.importo)}</strong>
                    <button
                      type="button"
                      className="btn ghost icon"
                      aria-label={`Modifica ${t.descrizione}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(t);
                      }}
                    >
                      <Icon name="edit" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
