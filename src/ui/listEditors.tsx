import { useState, type FormEvent } from 'react';
import { palette } from '../domain/defaults';
import { newId } from '../domain/id';
import { formatEuro, sum } from '../domain/money';
import { currentMonth, monthLabel } from '../domain/month';
import { frequencyLabels, monthlyEquivalent } from '../domain/recurring';
import type { Category, Frequency, ID, Recurring } from '../domain/types';
import { CategoryDot, ConfirmButton, Field, IconButton, Modal, MoneyInput, Notice } from './components';
import { Icon } from './icons';

// Editor di elenchi condivisi tra spese personali e spese comuni.

function blankRecurring(categorie: Category[]): Recurring {
  return {
    id: newId(),
    descrizione: '',
    categoriaId: categorie.find((c) => !c.archiviata)?.id ?? '',
    importo: 0,
    frequenza: 1,
    meseInizio: currentMonth(),
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
            .sort((a, b) => Number(b.attiva) - Number(a.attiva) || b.importo / b.frequenza - a.importo / a.frequenza)
            .map((r) => {
              const c = categories.get(r.categoriaId);
              return (
                <li key={r.id} className="list-item" style={{ opacity: r.attiva ? 1 : 0.55 }}>
                  <CategoryDot color={c?.colore ?? 'var(--axis)'} />
                  <div className="grow">
                    <div className="title">{r.descrizione}</div>
                    <div className="sub">
                      {frequencyLabels[r.frequenza]} da {monthLabel(r.meseInizio).toLowerCase()}
                      {r.meseFine ? ` a ${monthLabel(r.meseFine).toLowerCase()}` : ''} · {c?.nome}
                      {!r.attiva && ' · in pausa'}
                    </div>
                  </div>
                  <div className="num">
                    <strong>{formatEuro(r.importo)}</strong>
                    {r.frequenza > 1 && <div className="small muted">{formatEuro(monthlyEquivalent(r))}/mese</div>}
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
          <select className="input" value={r.frequenza} onChange={(e) => set({ frequenza: Number(e.target.value) as Frequency })}>
            {Object.entries(frequencyLabels).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Primo mese">
          <input className="input" type="month" required value={r.meseInizio} onChange={(e) => set({ meseInizio: e.target.value })} />
        </Field>
        <Field label="Ultimo mese" hint="Facoltativo, es. fine di una rata">
          <input className="input" type="month" value={r.meseFine ?? ''} onChange={(e) => set({ meseFine: e.target.value || undefined })} />
        </Field>
        <Field label="Giorno di addebito">
          <input className="input" type="number" min={1} max={31} value={r.giorno ?? ''} onChange={(e) => set({ giorno: e.target.value ? Number(e.target.value) : undefined })} />
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
