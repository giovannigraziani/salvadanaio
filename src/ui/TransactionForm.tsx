import { useState, type FormEvent } from 'react';
import { newId } from '../domain/id';
import { personName } from '../domain/joint';
import { formatEuro } from '../domain/money';
import { monthOfDate, today } from '../domain/month';
import type { JointTransaction, Payer, Transaction } from '../domain/types';
import { deleteTransaction, saveTransaction } from '../store/actions';
import { deleteJointTransaction, saveJointTransaction } from '../store/jointActions';
import { useData } from '../store/store';
import { ConfirmButton, Field, Modal, MoneyInput, Segmented } from './components';

/** Spesa personale (dal mio stipendio) o comune (dal conto cointestato). */
export type Scope = 'personale' | 'comune';

export interface EditingTransaction {
  tx: JointTransaction;
  scope: Scope;
}

export function blankTransaction(partial: Partial<JointTransaction> = {}): JointTransaction {
  return { id: newId(), data: today(), descrizione: '', categoriaId: '', importo: 0, pagatoDa: 'conto', ...partial };
}

/** Finestra per registrare o modificare una spesa effettiva, personale o comune. */
export function TransactionModal({ editing, onClose }: { editing: EditingTransaction | null; onClose: () => void }) {
  const data = useData();
  const exists =
    !!editing &&
    (editing.scope === 'comune' ? data.cointestato.movimenti : data.movimenti).some((t) => t.id === editing.tx.id);
  return (
    <Modal open={!!editing} onClose={onClose} title={exists ? 'Modifica spesa' : 'Nuova spesa'}>
      {editing && <TransactionForm initial={editing.tx} initialScope={editing.scope} exists={exists} onDone={onClose} />}
    </Modal>
  );
}

function TransactionForm({
  initial,
  initialScope,
  exists,
  onDone,
}: {
  initial: JointTransaction;
  initialScope: Scope;
  exists: boolean;
  onDone: () => void;
}) {
  const data = useData();
  const [scope, setScope] = useState<Scope>(initialScope);
  const source = scope === 'comune' ? data.cointestato : data;
  const categorie = source.categorie.filter((c) => !c.archiviata || c.id === initial.categoriaId);
  const [tx, setTx] = useState<JointTransaction>({ ...initial, categoriaId: initial.categoriaId || categorie[0]?.id || '' });
  const [error, setError] = useState('');

  // Spese previste del mese ancora da pagare (più quella già collegata).
  const plan = source.piani[monthOfDate(tx.data)];
  const linkable = (plan?.spesePreviste ?? []).filter((p) => !p.movimentoId || p.id === initial.previstaId);

  const set = (patch: Partial<JointTransaction>) => setTx((t) => ({ ...t, ...patch }));

  const changeScope = (next: Scope) => {
    setScope(next);
    const list = next === 'comune' ? data.cointestato.categorie : data.categorie;
    set({ categoriaId: list.find((c) => !c.archiviata)?.id ?? '', previstaId: undefined });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tx.importo <= 0) return setError('Inserisci un importo maggiore di zero.');
    if (!tx.categoriaId) return setError('Scegli una categoria.');
    const cleaned = { ...tx, descrizione: tx.descrizione.trim() || categorie.find((c) => c.id === tx.categoriaId)?.nome || 'Spesa' };
    if (cleaned.previstaId && !linkable.some((p) => p.id === cleaned.previstaId)) delete cleaned.previstaId;
    if (scope === 'comune') saveJointTransaction(cleaned);
    else {
      const { pagatoDa: _pagatoDa, rimborsato: _rimborsato, ...personal } = cleaned;
      saveTransaction(personal satisfies Transaction);
    }
    onDone();
  };

  return (
    <form onSubmit={submit}>
      {!exists && (
        <div style={{ marginBottom: 14 }}>
          <Segmented<Scope>
            label="Tipo di spesa"
            value={scope}
            onChange={changeScope}
            options={[
              { value: 'personale', label: 'Mia' },
              { value: 'comune', label: 'Comune (cointestato)' },
            ]}
          />
        </div>
      )}
      <div className="form-grid">
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
            placeholder={scope === 'comune' ? 'Es. spesa al supermercato' : 'Es. cena con amici'}
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
        {scope === 'comune' && (
          <>
            <Field label="Pagata da" hint={tx.pagatoDa === 'conto' ? undefined : 'Spesa anticipata: il conto dovrà rimborsarla.'}>
              <select className="input" value={tx.pagatoDa} onChange={(e) => set({ pagatoDa: e.target.value as Payer })}>
                {(['conto', 'io', 'partner'] as const).map((p) => (
                  <option key={p} value={p}>
                    {p === 'conto' ? 'Conto cointestato' : `${personName(data, p)} (anticipata)`}
                  </option>
                ))}
              </select>
            </Field>
            {tx.pagatoDa !== 'conto' && (
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
                if (scope === 'comune') deleteJointTransaction(tx.id);
                else deleteTransaction(tx.id);
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
