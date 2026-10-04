import { useState } from 'react';
import { formatEuro, formatEuroShort, sum } from '../domain/money';
import { dateInMonth, dateLabel, daysInMonth, today, weekday } from '../domain/month';
import type { Category, DateKey, MonthKey, PlannedExpense, Transaction } from '../domain/types';

const headers = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

/**
 * Calendario del mese: per ogni giorno le spese previste (colorate per categoria, spuntate se pagate)
 * e il totale speso. Toccando un giorno se ne vede il dettaglio.
 */
export function MonthCalendar({
  month,
  planned,
  transactions,
  categorie,
  onPlannedClick,
}: {
  month: MonthKey;
  planned: PlannedExpense[];
  transactions: Transaction[];
  categorie: Category[];
  onPlannedClick: (p: PlannedExpense) => void;
}) {
  const [selected, setSelected] = useState<DateKey | null>(null);
  const colors = new Map(categorie.map((c) => [c.id, c.colore]));
  const days = daysInMonth(month);
  // Lunedì come primo giorno della settimana.
  const offset = (weekday(dateInMonth(month, 1)) + 6) % 7;
  const cells: (DateKey | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => dateInMonth(month, i + 1))];
  while (cells.length % 7) cells.push(null);
  const todayKey = today();
  const plannedOn = (d: DateKey) => planned.filter((p) => p.data === d);
  const spentOn = (d: DateKey) => transactions.filter((t) => t.data === d);
  const undated = planned.filter((p) => !p.data);

  const detailPlanned = selected ? plannedOn(selected) : [];
  const detailSpent = selected ? spentOn(selected) : [];

  return (
    <div>
      <div className="calendar" role="grid" aria-label="Calendario del mese">
        {headers.map((h) => (
          <div key={h} className="calendar-head" role="columnheader">
            {h}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="calendar-cell empty" />;
          const items = plannedOn(d);
          const spent = sum(spentOn(d), (t) => t.importo);
          const label = `${dateLabel(d)}: ${items.length} spese previste${spent ? `, speso ${formatEuro(spent)}` : ''}`;
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              aria-label={label}
              aria-pressed={selected === d}
              className={`calendar-cell ${d === todayKey ? 'today' : ''} ${selected === d ? 'selected' : ''}`}
              onClick={() => setSelected(selected === d ? null : d)}
            >
              <span className="calendar-day">{Number(d.slice(8))}</span>
              <span className="calendar-items">
                {items.map((p) => (
                  <span key={p.id} className={`calendar-chip ${p.movimentoId ? 'paid' : ''}`} style={{ borderColor: colors.get(p.categoriaId) }}>
                    <i style={{ background: colors.get(p.categoriaId) }} />
                    <span className="calendar-chip-text">{p.descrizione}</span>
                  </span>
                ))}
              </span>
              {spent > 0 && <span className="calendar-spent">{formatEuroShort(spent)}</span>}
            </button>
          );
        })}
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        <span>
          <i style={{ background: 'var(--accent)' }} /> Spesa prevista
        </span>
        <span>
          <i style={{ background: 'var(--axis)' }} /> Barrata = già pagata
        </span>
        <span>In basso: totale speso nel giorno</span>
      </div>

      {selected && (
        <div className="calendar-detail">
          <h3>{dateLabel(selected)}</h3>
          {detailPlanned.length === 0 && detailSpent.length === 0 && <p className="muted small">Niente in questo giorno.</p>}
          <ul className="list">
            {detailPlanned.map((p) => (
              <li key={p.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => onPlannedClick(p)}>
                <span className="dot" style={{ background: colors.get(p.categoriaId) }} />
                <div className="grow">
                  <div className="title">{p.descrizione}</div>
                  <div className="sub">Prevista{p.movimentoId ? ' · pagata' : ''}</div>
                </div>
                <strong className="num">{formatEuro(p.importo)}</strong>
              </li>
            ))}
            {detailSpent
              .filter((t) => !t.previstaId)
              .map((t) => (
                <li key={t.id} className="list-item">
                  <span className="dot" style={{ background: colors.get(t.categoriaId) }} />
                  <div className="grow">
                    <div className="title">{t.descrizione}</div>
                    <div className="sub">Spesa estemporanea</div>
                  </div>
                  <strong className="num">{formatEuro(t.importo)}</strong>
                </li>
              ))}
          </ul>
        </div>
      )}
      {undated.length > 0 && (
        <p className="small muted">
          Senza data:{' '}
          {undated
            .map((p) => {
              if (!p.aConsumo) return `${p.descrizione} (${formatEuro(p.importo)})`;
              const spent = sum(transactions.filter((t) => t.previstaId === p.id), (t) => t.importo);
              return `${p.descrizione}, a consumo: ${formatEuro(spent)} di ${formatEuro(p.importo)}`;
            })
            .join(' · ')}
          .
        </p>
      )}
    </div>
  );
}
