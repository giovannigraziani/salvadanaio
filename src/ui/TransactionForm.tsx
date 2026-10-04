import { useState, type FormEvent } from 'react';
import { newId } from '../domain/id';
import { formatEuro } from '../domain/money';
import { monthOfDate, today } from '../domain/month';
import type { Transaction } from '../domain/types';
import { deleteTransaction, saveTransaction } from '../store/actions';
import { useData } from '../store/store';
import { ConfirmButton, Field, Modal, MoneyInput } from './components';

export function blankTransaction(partial: Partial<Transaction> = {}): Transaction {
  return { id: newId(), data: today(), descrizione: '', categoriaId: '', importo: 0, ...partial };
}

/** Finestra per registrare o modificare una spesa effettiva. */
export function TransactionModal({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  return (
    <Modal open={!!tx} onClose={onClose} title={tx && tx.importo ? 'Modifica spesa' : 'Nuova spesa'}>
      {tx && <TransactionForm initial={tx} onDone={onClose} />}
    </Modal>
  );
}

function TransactionForm({ initial, onDone }: { initial: Transaction; onDone: () => void }) {
  const data = useData();
  const categorie = data.categorie.filter((c) => !c.archiviata || c.id === initial.categoriaId);
  const [tx, setTx] = useState<Transaction>({ ...initial, categoriaId: initial.categoriaId || categorie[0]?.id || '' });
  const [error, setError] = useState('');
  const isNew = !data.movimenti.some((t) => t.id === tx.id);

  // Spese previste del mese ancora da pagare (più quella già collegata).
  const plan = data.piani[monthOfDate(tx.data)];
  const linkable = (plan?.spesePreviste ?? []).filter((p) => !p.movimentoId || p.id === initial.previstaId);

  const set = (patch: Partial<Transaction>) => setTx((t) => ({ ...t, ...patch }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tx.importo <= 0) return setError("Inserisci un importo maggiore di zero.");
    if (!tx.categoriaId) return setError('Scegli una categoria.');
    const cleaned = { ...tx, descrizione: tx.descrizione.trim() || data.categorie.find((c) => c.id === tx.categoriaId)?.nome || 'Spesa' };
    if (cleaned.previstaId && !linkable.some((p) => p.id === cleaned.previstaId)) delete cleaned.previstaId;
    saveTransaction(cleaned);
    onDone();
  };

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Importo (€)">
          <MoneyInput value={tx.importo} onChange={(importo) => set({ importo })} autoFocus={isNew} />
        </Field>
        <Field label="Data">
          <input className="input" type="date" required value={tx.data} onChange={(e) => set({ data: e.target.value })} />
        </Field>
        <Field label="Descrizione" full>
          <input className="input" value={tx.descrizione} placeholder="Es. cena con amici" onChange={(e) => set({ descrizione: e.target.value })} />
        </Field>
        <Field label="Categoria">
          <select className="input" value={tx.categoriaId} onChange={(e) => set({ categoriaId: e.target.value })}>
            {categorie.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Era pianificata?" hint={linkable.length ? undefined : 'Nessuna spesa prevista da collegare in questo mese.'}>
          <select
            className="input"
            value={tx.previstaId ?? ''}
            disabled={!linkable.length}
            onChange={(e) => {
              const p = linkable.find((x) => x.id === e.target.value);
              if (!p) return set({ previstaId: undefined });
              set({
                previstaId: p.id,
                categoriaId: p.categoriaId,
                descrizione: tx.descrizione || p.descrizione,
                importo: tx.importo || p.importo,
              });
            }}
          >
            <option value="">No, estemporanea</option>
            {linkable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.descrizione} ({formatEuro(p.importo)})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note" full>
          <input className="input" value={tx.note ?? ''} onChange={(e) => set({ note: e.target.value || undefined })} />
        </Field>
      </div>
      {error && (
        <p className="text-bad small" role="alert">
          {error}
        </p>
      )}
      <div className="modal-foot">
        <div>
          {!isNew && (
            <ConfirmButton
              className="btn danger"
              question="Eliminare la spesa?"
              confirmLabel="Elimina"
              onConfirm={() => {
                deleteTransaction(tx.id);
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
