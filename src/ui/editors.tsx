import type { Account, Cents, Goal, ID } from '../domain/types';
import { IconButton, MoneyInput } from './components';
import { Icon } from './icons';

// Editor condivisi tra piano mensile e modello.

export interface IncomeRow {
  descrizione: string;
  importo: Cents;
}

export function IncomeEditor<T extends IncomeRow>({
  lines,
  onChange,
  onAdd,
}: {
  lines: T[];
  onChange: (index: number, patch: Partial<IncomeRow> | null) => void;
  onAdd: () => void;
}) {
  return (
    <div className="rows">
      {lines.map((line, i) => (
        <div className="inline-row" key={i}>
          <input className="input compact" value={line.descrizione} aria-label="Descrizione entrata" onChange={(e) => onChange(i, { descrizione: e.target.value })} />
          <MoneyInput className="compact" value={line.importo} ariaLabel="Importo entrata" onChange={(importo) => onChange(i, { importo })} />
          <IconButton icon="trash" label="Rimuovi entrata" onClick={() => onChange(i, null)} />
        </div>
      ))}
      <div>
        <button type="button" className="btn small" onClick={onAdd}>
          <Icon name="plus" /> Aggiungi entrata
        </button>
      </div>
    </div>
  );
}

export interface TransferRow {
  descrizione: string;
  importo: Cents;
  contoId?: ID;
  obiettivoId?: ID;
  eseguito?: boolean;
}

/** Valore della select "destinazione": "conto:<id>" o "obiettivo:<id>". */
function destinationValue(row: TransferRow) {
  if (row.obiettivoId) return `obiettivo:${row.obiettivoId}`;
  if (row.contoId) return `conto:${row.contoId}`;
  return '';
}

export function TransferEditor<T extends TransferRow>({
  lines,
  conti,
  obiettivi,
  onChange,
  onAdd,
  onToggleDone,
}: {
  lines: T[];
  conti: Account[];
  obiettivi: Goal[];
  onChange: (index: number, patch: Partial<TransferRow> | null) => void;
  onAdd: () => void;
  /** Se presente mostra la casella "versato". */
  onToggleDone?: (index: number, done: boolean) => void;
}) {
  const activeGoals = obiettivi.filter((g) => !g.archiviato);
  return (
    <div className="rows">
      {lines.map((line, i) => (
        <div className="inline-row with-target" key={i}>
          <input className="input compact" value={line.descrizione} aria-label="Descrizione quota" onChange={(e) => onChange(i, { descrizione: e.target.value })} />
          <select
            className="input compact"
            aria-label="Destinazione"
            value={destinationValue(line)}
            onChange={(e) => {
              const [kind, id] = e.target.value.split(':');
              onChange(i, { contoId: kind === 'conto' ? id : undefined, obiettivoId: kind === 'obiettivo' ? id : undefined });
            }}
          >
            <option value="">Verso… (scegli la destinazione)</option>
            <optgroup label="Altri conti">
              {conti.map((c) => (
                <option key={c.id} value={`conto:${c.id}`}>
                  {c.nome}
                </option>
              ))}
            </optgroup>
            {activeGoals.length > 0 && (
              <optgroup label="Obiettivi">
                {activeGoals.map((g) => (
                  <option key={g.id} value={`obiettivo:${g.id}`}>
                    {g.nome}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <MoneyInput className="compact" value={line.importo} ariaLabel="Importo quota" onChange={(importo) => onChange(i, { importo })} />
          <div className="actions" style={{ flexWrap: 'nowrap', gap: 2 }}>
            {onToggleDone && (
              <label className="check" title="Versamento eseguito">
                <input type="checkbox" checked={!!line.eseguito} onChange={(e) => onToggleDone(i, e.target.checked)} aria-label="Versamento eseguito" />
              </label>
            )}
            <IconButton icon="trash" label="Rimuovi quota" onClick={() => onChange(i, null)} />
          </div>
        </div>
      ))}
      <div>
        <button type="button" className="btn small" onClick={onAdd}>
          <Icon name="plus" /> Aggiungi quota
        </button>
      </div>
    </div>
  );
}
