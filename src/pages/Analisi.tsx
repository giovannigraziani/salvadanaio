import { useState } from 'react';
import { budgetSuggestions, moneyFlow, rangeStats, savedOf, savingsRate, spendingByKind } from '../domain/analysis';
import { projectGoal } from '../domain/goals';
import { formatEuro, percent, sum } from '../domain/money';
import { addMonths, currentMonth, lastMonths, monthLabel, monthShortLabel } from '../domain/month';
import type { AppData, Cents, MonthKey } from '../domain/types';
import { mutate, useData } from '../store/store';
import { BudgetBars, FlowBar, StackedColumns, type ColumnDatum } from '../ui/charts';
import { CategoryDot, MonthSwitcher, Notice, Segmented, Stat } from '../ui/components';
import { Icon } from '../ui/icons';

type Range = 1 | 3 | 6 | 12;

export function Analisi() {
  const data = useData();
  const [end, setEnd] = useState<MonthKey>(currentMonth());
  const [range, setRange] = useState<Range>(3);
  const stats = rangeStats(data, end, range);
  const months = stats.length;

  const header = (
    <div className="page-head">
      <div>
        <h1>Analisi</h1>
        <p>Dove vanno davvero i tuoi soldi e come ridistribuire il budget.</p>
      </div>
      <div className="actions">
        <Segmented<Range>
          label="Periodo"
          value={range}
          onChange={setRange}
          options={[
            { value: 1, label: 'Mese' },
            { value: 3, label: '3 mesi' },
            { value: 6, label: '6 mesi' },
            { value: 12, label: '12 mesi' },
          ]}
        />
        <MonthSwitcher month={end} onChange={setEnd} />
      </div>
    </div>
  );

  if (months === 0)
    return (
      <>
        {header}
        <div className="card empty">
          <h2>Ancora nessun dato in questo periodo</h2>
          <p>Crea un piano mensile e registra qualche spesa per vedere le analisi.</p>
        </div>
      </>
    );

  const avg = (v: Cents) => Math.round(v / months);
  const entrate = sum(stats, (s) => s.entrate);
  const speso = sum(stats, (s) => s.speso);
  const estemporaneo = sum(stats, (s) => s.spesoEstemporaneo);
  const kinds = spendingByKind(stats, data.categorie);
  const flow = moneyFlow(stats, data.categorie);
  const transfer = (k: string) => flow.slices.find((s) => s.key === k)?.value ?? 0; // chiavi dei trasferimenti
  const segments = [
    { key: 'cointestato', label: 'Conto cointestato', value: transfer('cointestato'), color: '#2a78d6' },
    { key: 'risparmio', label: 'Risparmi', value: transfer('risparmio'), color: '#eb6834' },
    { key: 'accantonamenti', label: 'Obiettivi e investimenti', value: transfer('obiettivi') + transfer('investimenti'), color: '#1baf7a' },
    { key: 'essenziali', label: 'Spese essenziali', value: kinds.essenziale, color: '#eda100' },
    { key: 'discrezionali', label: 'Spese discrezionali', value: kinds.discrezionale, color: '#e87ba4' },
    { key: 'altro', label: 'Altri trasferimenti', value: transfer('altro'), color: '#4a3aa7' },
    { key: 'avanzo', label: 'Non speso', value: Math.max(0, flow.avanzo), color: 'var(--axis)' },
  ];
  const periodLabel = range === 1 ? monthLabel(end) : `${monthLabel(stats[0]!.mese)} – ${monthLabel(stats[stats.length - 1]!.mese)}`;

  return (
    <>
      {header}
      <p className="muted small" style={{ marginTop: -8 }}>
        {periodLabel} · {months} {months === 1 ? 'mese' : 'mesi'} con dati{months > 1 ? ' · valori medi mensili' : ''}
        {end === currentMonth() && ' · il mese in corso non è ancora concluso'}
      </p>

      <div className="grid grid-4">
        <Stat label={months > 1 ? 'Entrate medie' : 'Entrate'} value={formatEuro(avg(entrate))} />
        <Stat label={months > 1 ? 'Spese personali medie' : 'Spese personali'} value={formatEuro(avg(speso))} hint={`${percent(kinds.discrezionale, speso)}% discrezionali`} />
        <Stat label="Tasso di risparmio" value={`${savingsRate(stats)}%`} hint={`${formatEuro(avg(sum(stats, savedOf)))} al mese tra risparmi e obiettivi`} />
        <Stat label="Spese estemporanee" value={`${percent(estemporaneo, speso)}%`} hint={`${formatEuro(avg(estemporaneo))} al mese non pianificati`} />
      </div>

      <div className="card section-gap">
        <div className="card-head">
          <div>
            <h2>Dove vanno le entrate</h2>
            <p>Somma del periodo: {formatEuro(entrate)} di entrate.</p>
          </div>
        </div>
        <FlowBar segments={segments} total={entrate} />
        {flow.avanzo < 0 && (
          <div className="section-gap">
            <Notice kind="warn">
              Nel periodo hai speso {formatEuro(-flow.avanzo)} più di quanto rimaneva dopo i versamenti: probabilmente stai attingendo ai risparmi.
            </Notice>
          </div>
        )}
      </div>

      <div className="grid grid-2 section-gap">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Budget e speso per categoria</h2>
              <p>{months > 1 ? 'Media mensile del periodo.' : 'Il mese selezionato.'}</p>
            </div>
          </div>
          <BudgetBars
            rows={data.categorie
              .map((c) => ({
                key: c.id,
                label: c.nome,
                color: c.colore,
                value: avg(sum(stats, (s) => s.perCategoria[c.id] ?? 0)),
                budget: avg(sum(stats, (s) => data.piani[s.mese]?.budget[c.id] ?? 0)),
              }))
              .filter((r) => r.value || r.budget)
              .sort((a, b) => b.value - a.value)}
          />
        </div>
        <PlannedVsUnplanned data={data} months={stats.map((s) => s.mese)} />
      </div>

      <Trend data={data} end={end} count={Math.max(range, 6)} />

      <Suggestions data={data} end={end} range={range === 1 ? 3 : range} />
    </>
  );
}

function PlannedVsUnplanned({ data, months }: { data: AppData; months: MonthKey[] }) {
  const set = new Set(months);
  const tx = data.movimenti.filter((t) => set.has(t.data.slice(0, 7)));
  const rows = data.categorie
    .map((c) => {
      const items = tx.filter((t) => t.categoriaId === c.id);
      const pianificato = sum(items.filter((t) => t.previstaId), (t) => t.importo);
      const totale = sum(items, (t) => t.importo);
      return { c, pianificato, estemporaneo: totale - pianificato, totale };
    })
    .filter((r) => r.totale > 0)
    .sort((a, b) => b.estemporaneo - a.estemporaneo);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Pianificato o estemporaneo?</h2>
          <p>Totali del periodo. Le spese estemporanee sono quelle su cui agire.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Categoria</th>
              <th className="num">Pianificato</th>
              <th className="num">Estemporaneo</th>
              <th className="num">% estemp.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.c.id}>
                <td>
                  <span className="actions" style={{ flexWrap: 'nowrap' }}>
                    <CategoryDot color={r.c.colore} />
                    {r.c.nome}
                  </span>
                </td>
                <td className="num">{formatEuro(r.pianificato)}</td>
                <td className="num">{formatEuro(r.estemporaneo)}</td>
                <td className="num">{percent(r.estemporaneo, r.totale)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Trend({ data, end, count }: { data: AppData; end: MonthKey; count: number }) {
  const months = lastMonths(end, count);
  const totals = new Map<string, Cents>();
  for (const t of data.movimenti)
    if (months.includes(t.data.slice(0, 7))) totals.set(t.categoriaId, (totals.get(t.categoriaId) ?? 0) + t.importo);
  // Al massimo 7 categorie con il proprio colore; le altre confluiscono in "Altre".
  const ranked = data.categorie.filter((c) => totals.get(c.id)).sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
  const shown = ranked.length > 8 ? ranked.slice(0, 7) : ranked;
  const others = new Set(ranked.slice(shown.length).map((c) => c.id));
  const series = shown.map((c) => ({ key: c.id, label: c.nome, color: c.colore }));
  if (others.size) series.push({ key: 'altre', label: 'Altre', color: '#898781' });

  const columns: ColumnDatum[] = months.map((m) => {
    const values: Record<string, Cents> = {};
    for (const t of data.movimenti) {
      if (t.data.slice(0, 7) !== m) continue;
      const key = others.has(t.categoriaId) ? 'altre' : t.categoriaId;
      values[key] = (values[key] ?? 0) + t.importo;
    }
    const plan = data.piani[m];
    return {
      key: m,
      label: monthShortLabel(m),
      values,
      reference: plan ? sum(Object.values(plan.budget), (b) => b) : undefined,
    };
  });

  return (
    <div className="card section-gap">
      <div className="card-head">
        <div>
          <h2>Andamento mensile delle spese</h2>
          <p>Ultimi {count} mesi fino a {monthLabel(end).toLowerCase()}, per categoria.</p>
        </div>
      </div>
      <StackedColumns data={columns} series={series} referenceLabel="Budget totale" />
    </div>
  );
}

function Suggestions({ data, end, range }: { data: AppData; end: MonthKey; range: number }) {
  // Il mese in corso è incompleto: falserebbe le medie verso il basso.
  const inProgress = end === currentMonth();
  const basis = inProgress ? addMonths(end, -1) : end;
  const suggestions = budgetSuggestions(data, basis, range);
  const freed = sum(suggestions.filter((s) => s.kind === 'riduci'), (s) => s.budget - s.proposto);
  const needed = sum(suggestions.filter((s) => s.kind !== 'riduci'), (s) => s.proposto - s.budget);
  const behind = data.obiettivi
    .filter((g) => !g.archiviato)
    .map((g) => ({ g, p: projectGoal(g, end) }))
    .filter(({ p }) => p.status === 'in-ritardo');

  // Aggiorna il modello; nei piani del mese e del successivo il budget copre comunque le spese previste.
  const apply = (categoriaId: string, value: Cents) =>
    mutate((d) => {
      d.modello.budget[categoriaId] = value;
      for (const m of [end, addMonths(end, 1)]) {
        const plan = d.piani[m];
        if (!plan) continue;
        const previsto = sum(plan.spesePreviste.filter((p) => p.categoriaId === categoriaId), (p) => p.importo);
        plan.budget[categoriaId] = Math.max(value, previsto);
      }
    });

  return (
    <div className="card section-gap">
      <div className="card-head">
        <div>
          <h2>Come ridistribuire il budget</h2>
          <p>Budget del modello confrontato con il fabbisogno reale: spese estemporanee medie degli ultimi {range} mesi
            {inProgress ? ' conclusi' : ''} più la quota mensile delle ricorrenze.
          </p>
        </div>
      </div>
      {suggestions.length === 0 ? (
        <Notice kind="good">I budget sono in linea con quanto spendi davvero. Nessuna correzione necessaria.</Notice>
      ) : (
        <>
          <ul className="list">
            {suggestions.map((s) => (
              <li key={s.categoria.id} className="list-item wrap-mobile">
                <span style={{ color: s.kind === 'riduci' ? 'var(--good-text)' : 'var(--critical-text)', display: 'inline-flex', width: 18 }}>
                  <Icon name={s.kind === 'riduci' ? 'down' : 'up'} />
                </span>
                <div className="grow">
                  <div className="title">
                    {s.categoria.nome}: {s.kind === 'riduci' ? 'riduci' : s.kind === 'aumenta' ? 'aumenta' : 'aggiungi un budget'} a {formatEuro(s.proposto)}
                  </div>
                  <div className="sub">
                    Fabbisogno {formatEuro(s.fabbisogno)}/mese ({formatEuro(s.mediaEstemporanea)} estemporanee
                    {s.ricorrenti > 0 && ` + ${formatEuro(s.ricorrenti)} ricorrenti`}) · budget attuale {formatEuro(s.budget)}
                    {s.mesiSforati > 0 && ` · sforato in ${s.mesiSforati} mes${s.mesiSforati === 1 ? 'e' : 'i'} su ${s.mesi}`}
                  </div>
                </div>
                <button type="button" className="btn small" onClick={() => apply(s.categoria.id, s.proposto)} title="Aggiorna modello e piano del mese">
                  Applica
                </button>
              </li>
            ))}
          </ul>
          <div className="section-gap">
            <Notice kind="info">
              {freed > 0 && (
                <>
                  Riducendo i budget sovrastimati liberi <strong>{formatEuro(freed)} al mese</strong>.{' '}
                </>
              )}
              {needed > 0 && (
                <>
                  I budget sottostimati richiedono <strong>{formatEuro(needed)} al mese</strong> in più: è il costo reale delle tue abitudini.{' '}
                </>
              )}
              {freed > needed && behind.length > 0 && (
                <>
                  Il saldo positivo di {formatEuro(freed - needed)} potrebbe andare a <strong>{behind[0]!.g.nome}</strong>, che per rispettare la scadenza richiede{' '}
                  {formatEuro(behind[0]!.p.requiredMonthly ?? 0)} al mese.
                </>
              )}
              {needed > freed && ' Valuta se ridurre una spesa discrezionale o rivedere le quote verso il conto cointestato.'}
            </Notice>
          </div>
          <p className="small muted">"Applica" aggiorna il modello mensile e i piani di {monthLabel(end).toLowerCase()} e del mese successivo, se esistono.</p>
        </>
      )}
    </div>
  );
}
