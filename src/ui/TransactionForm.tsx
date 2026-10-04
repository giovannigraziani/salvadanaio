import { useState, type FormEvent } from 'react';
import { newId } from '../domain/id';
import { activeAccounts, findAccount, primaryAccount } from '../domain/ledger';
import { formatEuro } from '../domain/money';
import { monthOfDate, today } from '../domain/month';
import type { ID, Transaction } from '../domain/types';
import { deleteTransaction, saveTransaction } from '../store/actions';
import { useData } from '../store/store';
import { ConfirmButton, Field, Modal, MoneyInput } from './components';

export interface EditingTransaction {
  tx: Transaction;
  /** Conto della spesa; se assente si usa il conto predefinito. */
  accountId?: ID;
}

export function blankTransaction(partial: Partial<Transaction> = {}): Transaction {
  return { id: newId(), data: today(), descrizione: '', categoriaId: '', importo: 0, ...partial };
}

/** Finestra per registrare o modificare una spesa effettiva su un conto. */
export function TransactionModal({ editing, onClose }: { editing: EditingTransaction | null; onClose: () => void }) {
  const data = useData();
  const account = findAccount(data, editing?.accountId) ?? primaryAccount(data);
  const exists = !!editing && !!account?.movimenti.some((t) => t.id === editing.tx.id);
  return (
    <Modal open={!!editing && !!account} onClose={onClose} title={exists ? 'Modifica spesa' : 'Nuova spesa'}>
      {editing && account && <TransactionForm initial={editing.tx} initialAccountId={account.id} exists={exists} onDone={onClose} />}
    </Modal>
  );
}

function TransactionForm({ initial, initialAccountId, exists, onDone }: { initial: Transaction; initialAccountId: ID; exists: boolean; onDone: () => void }) {
  const data = useData();
  const [accountId, setAccountId] = useState(initialAccountId);
  const account = findAccount(data, accountId)!;
  const categorie = account.categorie.filter((c) => !c.archiviata || c.id === initial.categoriaId);
  const [tx, setTx] = useState<Transaction>({ ...initial, categoriaId: initial.categoriaId || categorie[0]?.id || '' });
  const [error, setError] = useState('');
  const others = activeAccounts(data).filter((a) => a.id !== accountId && a.tipo === 'personale');

  // Spese previste del mese ancora da pagare (più quella già collegata).
  const plan = account.piani[monthOfDate(tx.data)];
  const linkable = (plan?.spesePreviste ?? []).filter((p) => !p.movimentoId || p.id === initial.previstaId);

  const set = (patch: Partial<Transaction>) => setTx((t) => ({ ...t, ...patch }));

  const changeAccount = (id: ID) => {
    setAccountId(id);
    const next = findAccount(data, id);
    set({ categoriaId: next?.categorie.find((c) => !c.archiviata)?.id ?? '', previstaId: undefined, pagatoDa: undefined, rimborsato: undefined });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tx.importo <= 0) return setError('Inserisci un importo maggiore di zero.');
    if (!tx.categoriaId) return setError('Scegli una categoria.');
    const cleaned = { ...tx, descrizione: tx.descrizione.trim() || categorie.find((c) => c.id === tx.categoriaId)?.nome || 'Spesa' };
    if (cleaned.previstaId && !linkable.some((p) => p.id === cleaned.previstaId)) delete cleaned.previstaId;
    if (!cleaned.pagatoDa) {
      delete cleaned.pagatoDa;
      delete cleaned.rimborsato;
    }
    saveTransaction(accountId, cleaned);
    onDone();
  };

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        {!exists && (
          <Field label="Conto" full>
            <select className="input" value={accountId} onChange={(e) => changeAccount(e.target.value)}>
              {activeAccounts(data).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Importo (€)">
          <MoneyInput value={tx.importo} onChange={(importo) => set({ importo })} autoFocus={!exists} />
        </Field>
        <Field label="Data">
          <input className="input" type="date" required value={tx.data} onChange={(e) => set({ data: e.target.value })} />
        </Field>
        <Field label="Descrizione" full>
          <input
            className="input"
            value={tx.descrizione}
            placeholder={account.tipo === 'cointestato' ? 'Es. spesa al supermercato' : 'Es. cena con amici'}
            onChange={(e) => set({ descrizione: e.target.value })}
          />
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
              set({ previstaId: p.id, categoriaId: p.categoriaId, descrizione: tx.descrizione || p.descrizione, importo: tx.importo || p.importo });
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
        {account.tipo === 'cointestato' && others.length > 0 && (
          <>
            <Field label="Pagata da" hint={tx.pagatoDa ? 'Spesa anticipata: il conto dovrà rimborsarla.' : undefined}>
              <select className="input" value={tx.pagatoDa ?? ''} onChange={(e) => set({ pagatoDa: e.target.value || undefined })}>
                <option value="">{account.nome}</option>
                {others.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome} (anticipata)
                  </option>
                ))}
              </select>
            </Field>
            {tx.pagatoDa && (
              <label className="check" style={{ alignSelf: 'end', paddingBottom: 8 }}>
                <input type="checkbox" checked={!!tx.rimborsato} onChange={(e) => set({ rimborsato: e.target.checked })} />
                Già rimborsata dal conto
              </label>
            )}
          </>
        )}
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
          {exists && (
            <ConfirmButton
              className="btn danger"
              question="Eliminare la spesa?"
              confirmLabel="Elimina"
              onConfirm={() => {
                deleteTransaction(accountId, tx.id);
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
