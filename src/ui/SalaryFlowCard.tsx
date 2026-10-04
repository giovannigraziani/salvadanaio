import { useState } from 'react';
import { salaryFlow, type FlowMode } from '../domain/flow';
import { formatEuro } from '../domain/money';
import { currentMonth } from '../domain/month';
import type { AppData, MonthKey } from '../domain/types';
import { MonthSwitcher, Segmented } from './components';
import { SalaryFlowChart } from './SalaryFlowChart';

/** Scheda con il grafico "dove va lo stipendio" di una persona, teorico o effettivo. */
export function SalaryFlowCard({ data, person, month: fixedMonth }: { data: AppData; person: string; month?: MonthKey }) {
  const [mode, setMode] = useState<FlowMode>('teorico');
  const [chosenMonth, setMonth] = useState<MonthKey>(currentMonth());
  const month = fixedMonth ?? chosenMonth;
  const flow = salaryFlow(data, person, month, mode);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Dove va lo stipendio di {person}</h2>
          <p>
            {mode === 'teorico'
              ? 'Secondo il piano del mese: quote verso gli altri conti e budget per categoria. Per il cointestato conta la sua parte delle spese comuni.'
              : 'Quote versate e spese registrate finora. Per il cointestato conta la sua parte delle spese comuni.'}
          </p>
        </div>
        <div className="actions">
          <Segmented<FlowMode>
            label="Teorico o effettivo"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'teorico', label: 'Teorico' },
              { value: 'effettivo', label: 'Effettivo' },
            ]}
          />
          {!fixedMonth && <MonthSwitcher month={month} onChange={setMonth} />}
        </div>
      </div>
      <SalaryFlowChart flow={flow} title={`Entrate di ${person}`} />
      {flow.eccesso > 0 && (
        <p className="small text-bad" style={{ marginBottom: 0 }}>
          {mode === 'teorico' ? 'Il piano' : 'Le uscite'} superano le entrate di {formatEuro(flow.eccesso)}: le percentuali sommano più del 100%.
        </p>
      )}
    </div>
  );
}
