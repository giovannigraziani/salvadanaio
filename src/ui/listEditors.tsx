import { useState, type FormEvent } from 'react';
import { palette } from '../domain/defaults';
import { newId } from '../domain/id';
import { formatEuro, sum } from '../domain/money';
import { addMonths, currentMonth, dateLabel, today } from '../domain/month';
import { frequencyKey, frequencyOptions, monthlyEquivalent, occurrencesInMonth, scheduleLabel } from '../domain/schedule';
import type { Category, ID, Recurring } from '../domain/types';
import { CategoryDot, ConfirmButton, Field, IconButton, Modal, MoneyInput, Notice } from './components';
import { Icon } from './icons';

// Editor di elenchi condivisi tra spese personali e spese comuni.

function blankRecurring(categorie: Category[]): Recurring {
  return {
    id: newId(),
    descrizione: '',
    categoriaId: categorie.find((c) => !c.archiviata)?.id ?? '',
    importo: 0,
    ripetizione: { tipo: 'mesi', ogni: 1 },
    inizio: today(),
    attiva: true,
  };
}

// ---------- Spese ricorrenti ----------

export interface RecurringSectionProps {
  ricorrenze: Recurring[];
  categorie: Category[];
  onSave: (r: Recurring) => void;
  onDelete: (id: ID) => void;
  title: string;
  description: string;
  placeholder: string;
}

/** Elenco e modifica delle spese ricorrenti (personali o comuni). */
export function RecurringSection(props: RecurringSectionProps) {
  const { ricorrenze, categorie, title, description } = props;
  const [editing, setEditing] = useState<Recurring | null>(null);
  const categories = new Map(categorie.map((c) => [c.id, c]));
  const active = ricorrenze.filter((r) => r.attiva);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <p>
            {description} Costo medio:{' '}
            <strong>{formatEuro(sum(active, monthlyEquivalent))}/mese</strong>, <strong>{formatEuro(sum(active, monthlyEquivalent) * 12)}/anno</strong>.
          </p>
        </div>
        <button type="button" className="btn small primary" onClick={() => setEditing(blankRecurring(categorie))}>
          <Icon name="plus" /> Aggiungi
        </button>
      </div>
      {ricorrenze.length === 0 ? (
        <p className="muted">Nessuna spesa ricorrente.</p>
      ) : (
        <ul className="list">
          {[...ricorrenze]
            .sort((a, b) => Number(b.attiva) - Number(a.attiva) || monthlyEquivalent(b) - monthlyEquivalent(a))
            .map((r) => {
              const c = categories.get(r.categoriaId);
              return (
                <li key={r.id} className="list-item" style={{ opacity: r.attiva ? 1 : 0.55 }}>
                  <CategoryDot color={c?.colore ?? 'var(--axis)'} />
                  <div className="grow">
                    <div className="title">{r.descrizione}</div>
                    <div className="sub">
                      {r.aConsumo && <span className="badge accent">a consumo</span>} {scheduleLabel(r)} · {c?.nome}
                      {r.fine ? ` · fino al ${dateLabel(r.fine)} ${r.fine.slice(0, 4)}` : ''}
                      {!r.attiva && ' · in pausa'}
                    </div>
                  </div>
                  <div className="num">
                    <strong>{formatEuro(r.importo)}</strong>
                    {monthlyEquivalent(r) !== r.importo && <div className="small muted">{formatEuro(monthlyEquivalent(r))}/mese</div>}
                  </div>
                  <IconButton icon="edit" label={`Modifica ${r.descrizione}`} onClick={() => setEditing(r)} />
                </li>
              );
            })}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.descrizione ? 'Modifica spesa ricorrente' : 'Nuova spesa ricorrente'}>
        {editing && <RecurringForm {...props} initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function RecurringForm({
  ricorrenze,
  categorie,
  onSave,
  onDelete,
  placeholder,
  initial,
  onDone,
}: RecurringSectionProps & { initial: Recurring; onDone: () => void }) {
  const [r, setR] = useState(initial);
  const exists = ricorrenze.some((x) => x.id === r.id);
  const set = (patch: Partial<Recurring>) => setR((x) => ({ ...x, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!r.descrizione.trim() || r.importo <= 0) return;
    onSave({ ...r, descrizione: r.descrizione.trim() });
    onDone();
  };
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Descrizione" full>
          <input className="input" required autoFocus={!exists} value={r.descrizione} placeholder={placeholder} onChange={(e) => set({ descrizione: e.target.value })} />
        </Field>
        <Field label="Importo (€)">
          <MoneyInput value={r.importo} onChange={(importo) => set({ importo })} />
        </Field>
        <Field label="Frequenza">
          <select
            className="input"
            value={frequencyKey(r.ripetizione)}
            onChange={(e) => set({ ripetizione: frequencyOptions.find((o) => o.key === e.target.value)!.ripetizione })}
          >
            {frequencyOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="check full consumo-toggle">
          <input type="checkbox" checked={!!r.aConsumo} onChange={(e) => set({ aConsumo: e.target.checked || undefined })} />
          <span>
            <strong>A consumo</strong>
            <span className="small muted" style={{ display: 'block' }}>
              Una voce senza data che più spese durante il mese vanno a riempire (es. carburante, spesa settimanale). Le nuove spese dello stesso tipo si
              collegano da sole.
            </span>
          </span>
        </label>
        <Field
          label={r.aConsumo ? 'Valida dal' : 'Prima data'}
          hint={
            r.aConsumo
              ? r.ripetizione.tipo === 'settimane'
                ? "L'importo del mese vale per ogni settimana (4 o 5 volte)"
                : 'Conta solo il mese di partenza'
              : r.ripetizione.tipo === 'settimane'
                ? 'Fissa il giorno della settimana (es. un giovedì)'
                : 'Fissa il giorno del mese'
          }
        >
          <input className="input" type="date" required value={r.inizio} onChange={(e) => e.target.value && set({ inizio: e.target.value })} />
        </Field>
        <Field label="Fino al" hint="Facoltativo, es. fine di una rata o di una terapia">
          <input className="input" type="date" min={r.inizio} value={r.fine ?? ''} onChange={(e) => set({ fine: e.target.value || undefined })} />
        </Field>
        <Field label="Categoria">
          <select className="input" value={r.categoriaId} onChange={(e) => set({ categoriaId: e.target.value })}>
            {categorie
              .filter((c) => !c.archiviata || c.id === r.categoriaId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </Field>
        {r.aConsumo ? (
          <div className="full small muted">
            Nel piano di questo mese la voce vale{' '}
            {formatEuro(r.importo * Math.max(1, occurrencesInMonth({ ...r, attiva: true }, currentMonth()).length))}.
          </div>
        ) : (
        <div className="full small muted">
          {scheduleLabel(r)}. Prossime date:{' '}
          {[0, 1, 2]
            .flatMap((i) => occurrencesInMonth({ ...r, attiva: true }, addMonths(currentMonth(), i)))
            .filter((d) => d >= today())
            .slice(0, 5)
            .map((d) => dateLabel(d))
            .join(', ') || 'nessuna nei prossimi tre mesi'}
          .
        </div>
        )}
        <label className="check full">
          <input type="checkbox" checked={r.attiva} onChange={(e) => set({ attiva: e.target.checked })} />
          Attiva
        </label>
      </div>
      <p className="small muted">Le modifiche si applicano ai piani creati da ora in poi; nei piani esistenti usa "Aggiungi ricorrenze mancanti".</p>
      <div className="modal-foot">
        <div>
          {exists && (
            <ConfirmButton
              className="btn danger"
              question="Eliminare? Le spese già nei piani restano."
              confirmLabel="Elimina"
              onConfirm={() => {
                onDelete(r.id);
                onDone();
              }}
            >
              Elimina
            </ConfirmButton>
          )}
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={onDone}>
            Annulla
          </button>
          <button type="submit" className="btn primary">
            Salva
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------- Categorie ----------

/** Elenco modificabile delle categorie (personali o comuni). */
export function CategoriesSection({
  categorie,
  onSave,
  onDelete,
  title,
  description,
}: {
  categorie: Category[];
  onSave: (c: Category) => void;
  /** Restituisce se la categoria è stata eliminata o, perché già usata, archiviata. */
  onDelete: (id: ID) => 'eliminata' | 'archiviata';
  title: string;
  description: string;
}) {
  const [message, setMessage] = useState('');
  const update = (c: Category, patch: Partial<Category>) => onSave({ ...c, ...patch });
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <button type="button" className="btn small" onClick={() => onSave({ id: newId(), nome: 'Nuova categoria', tipo: 'discrezionale', colore: palette[categorie.length % palette.length]! })}>
          <Icon name="plus" /> Aggiungi
        </button>
      </div>
      <div className="rows">
        {categorie.map((c) => (
          <div key={c.id} className="inline-row" style={{ gridTemplateColumns: 'auto 1fr 130px auto', opacity: c.archiviata ? 0.55 : 1 }}>
            <select
              className="input compact"
              aria-label={`Colore ${c.nome}`}
              value={c.colore}
              style={{ width: 44, background: c.colore, color: 'transparent' }}
              onChange={(e) => update(c, { colore: e.target.value })}
            >
              {palette.map((p, i) => (
                <option key={p} value={p} style={{ background: p }}>
                  Colore {i + 1}
                </option>
              ))}
            </select>
            <input className="input compact" value={c.nome} aria-label="Nome categoria" onChange={(e) => update(c, { nome: e.target.value })} />
            <select className="input compact" value={c.tipo} aria-label={`Tipo ${c.nome}`} onChange={(e) => update(c, { tipo: e.target.value as Category['tipo'] })}>
              <option value="essenziale">Essenziale</option>
              <option value="discrezionale">Discrezionale</option>
            </select>
            {c.archiviata ? (
              <button type="button" className="btn small" onClick={() => update(c, { archiviata: false })}>
                Ripristina
              </button>
            ) : (
              <IconButton
                icon="trash"
                label={`Elimina ${c.nome}`}
                onClick={() => {
                  const result = onDelete(c.id);
                  setMessage(result === 'archiviata' ? `"${c.nome}" è già usata: è stata archiviata invece che eliminata.` : '');
                }}
              />
            )}
          </div>
        ))}
      </div>
      {message && (
        <div className="section-gap">
          <Notice>{message}</Notice>
        </div>
      )}
    </div>
  );
}
