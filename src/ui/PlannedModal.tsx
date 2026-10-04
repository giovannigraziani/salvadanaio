import { useState, type FormEvent } from 'react';
import type { Category, ID, PlannedExpense } from '../domain/types';
import { Field, Modal, MoneyInput } from './components';

/** Finestra per aggiungere o modificare una spesa prevista in un piano mensile (personale o comune). */
export function PlannedModal({
  planned,
  onClose,
  ...props
}: {
  planned: PlannedExpense | null;
  categorie: Category[];
  exists: boolean;
  onSave: (p: PlannedExpense) => void;
  onRemove: (id: ID) => void;
  recurringHint: string;
  onClose: () => void;
}) {
  return (
    <Modal open={!!planned} onClose={onClose} title={props.exists ? 'Modifica spesa prevista' : 'Nuova spesa prevista'}>
      {planned && <PlannedForm {...props} initial={planned} onDone={onClose} />}
    </Modal>
  );
}

function PlannedForm({
  categorie,
  exists,
  onSave,
  onRemove,
  recurringHint,
  initial,
  onDone,
}: {
  categorie: Category[];
  exists: boolean;
  onSave: (p: PlannedExpense) => void;
  onRemove: (id: ID) => void;
  recurringHint: string;
  initial: PlannedExpense;
  onDone: () => void;
}) {
  const [p, setP] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!p.descrizione.trim() || p.importo <= 0) return;
    onSave({ ...p, descrizione: p.descrizione.trim() });
    onDone();
  };
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Descrizione" full>
          <input className="input" required autoFocus value={p.descrizione} placeholder="Es. visita oculistica" onChange={(e) => setP({ ...p, descrizione: e.target.value })} />
        </Field>
        <Field label="Importo previsto (€)">
          <MoneyInput value={p.importo} onChange={(importo) => setP({ ...p, importo })} />
        </Field>
        <Field label="Giorno del mese" hint="Facoltativo">
          <input
            className="input"
            type="number"
            min={1}
            max={31}
            value={p.giorno ?? ''}
            onChange={(e) => setP({ ...p, giorno: e.target.value ? Number(e.target.value) : undefined })}
          />
        </Field>
        <Field label="Categoria" full>
          <select className="input" value={p.categoriaId} onChange={(e) => setP({ ...p, categoriaId: e.target.value })}>
            {categorie
              .filter((c) => !c.archiviata || c.id === p.categoriaId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {p.ricorrenzaId && <p className="small muted">Modifichi solo questo mese. {recurringHint}</p>}
      <div className="modal-foot">
        <div>
          {exists && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                onRemove(p.id);
                onDone();
              }}
            >
              Rimuovi
            </button>
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
