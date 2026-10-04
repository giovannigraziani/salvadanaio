import { useState } from 'react';
import { budgetSuggestions, contributionRows, moneyFlow, rangeStats, savedOf, savingsRate, spendingByKind } from '../../domain/analysis';
import { palette } from '../../domain/defaults';
import { projectGoal } from '../../domain/goals';
import { balanceHistory, participants, shares } from '../../domain/ledger';
import { formatEuro, percent, sum } from '../../domain/money';
import { addMonths, currentMonth, lastMonths, monthLabel, monthShortLabel, today } from '../../domain/month';
import type { Account, AppData, Cents, MonthKey } from '../../domain/types';
import { mutate } from '../../store/store';
import { BudgetBars, FlowBar, StackedColumns, type ColumnDatum } from '../../ui/charts';
import { CategoryDot, Notice, Segmented, Stat } from '../../ui/components';
import { Icon } from '../../ui/icons';

type Range = 1 | 3 | 6 | 12;

export function AnalisiView({ data, account, end }: { data: AppData; account: Account; end: MonthKey }) {
  const [range, setRange] = useState<Range>(3);
  const stats = rangeStats(data, account, end, range);
  const months = stats.length;
  const control = (
    <div style={{ marginBottom: 16 }}>
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
    </div>
  );

  if (months === 0)
    return (
      <>
        {control}
        <div className="card empty">
          <h2>Ancora nessun dato in questo periodo</h2>
          <p>Crea il piano del mese e registra qualche spesa per vedere le analisi.</p>
        </div>
        <BalanceTable data={data} account={account} end={end} range={range} />
      </>
    );

  const avg = (v: Cents) => Math.round(v / months);
  const entrate = sum(stats, (s) => s.entrate);
  const speso = sum(stats, (s) => s.speso);
  const estemporaneo = sum(stats, (s) => s.spesoEstemporaneo);
  const kinds = spendingByKind(stats, account.categorie);
  const flow = moneyFlow(data, stats, account.categorie);
  const segments = [
    ...flow.slices.map((s, i) => ({ ...s, color: s.key === 'spese:essenziale' ? '#eda100' : s.key === 'spese:discrezionale' ? '#e87ba4' : palette[[0, 1, 2, 5, 6, 7][i % 6]!]! })),
    { key: 'avanzo', label: 'Non speso', value: Math.max(0, flow.avanzo), color: 'var(--axis)' },
  ];
  const isPersonal = account.tipo === 'personale';
  const shared = !!account.ripartizione && participants(data, account).length > 0;

  return (
    <>
      {control}
      <p className="muted small" style={{ marginTop: -8 }}>
        {months > 1 ? `${monthLabel(stats[0]!.mese)} – ${monthLabel(stats[months - 1]!.mese)} · valori medi mensili` : monthLabel(end)}
        {end === currentMonth() && ' · il mese in corso non è ancora concluso'}
      </p>

      <div className="grid grid-4">
        <Stat label={months > 1 ? 'Entrate medie' : 'Entrate'} value={formatEuro(avg(entrate))} />
        <Stat label={months > 1 ? 'Spese medie' : 'Spese'} value={formatEuro(avg(speso))} hint={`${percent(kinds.discrezionale, speso)}% discrezionali`} />
        {isPersonal ? (
          <Stat label="Tasso di risparmio" value={`${savingsRate(data, stats)}%`} hint={`${formatEuro(avg(sum(stats, (s) => savedOf(data, s))))} al mese tra risparmi e obiettivi`} />
        ) : (
          <Stat label="Budget medio" value={formatEuro(avg(sum(stats, (s) => s.budget)))} />
        )}
        <Stat label="Spese estemporanee" value={`${percent(estemporaneo, speso)}%`} hint={`${formatEuro(avg(estemporaneo))} al mese non pianificati`} />
      </div>

      {entrate > 0 && (
        <div className="card section-gap">
          <div className="card-head">
            <div>
              <h2>Dove vanno le entrate</h2>
              <p>Somma del periodo: {formatEuro(entrate)}.</p>
            </div>
          </div>
          <FlowBar segments={segments} total={entrate} />
          {flow.avanzo < 0 && (
            <div className="section-gap">
              <Notice kind="warn">Nel periodo sono usciti {formatEuro(-flow.avanzo)} più di quanto è entrato: il saldo del conto è sceso.</Notice>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-2 section-gap">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Budget e speso per categoria</h2>
              <p>{months > 1 ? 'Media mensile del periodo.' : 'Il mese selezionato.'}</p>
            </div>
          </div>
          <BudgetBars
            rows={account.categorie
              .map((c) => ({
                key: c.id,
                label: c.nome,
                color: c.colore,
                value: avg(sum(stats, (s) => s.perCategoria[c.id] ?? 0)),
                budget: avg(sum(stats, (s) => account.piani[s.mese]?.budget[c.id] ?? 0)),
              }))
              .filter((r) => r.value || r.budget)
              .sort((a, b) => b.value - a.value)}
          />
        </div>
        {shared ? <Contributions data={data} account={account} stats={stats} /> : <PlannedVsUnplanned account={account} months={stats.map((s) => s.mese)} />}
      </div>

      <Trend account={account} end={end} count={Math.max(range, 6)} />
      {shared && (
        <div className="section-gap">
          <PlannedVsUnplanned account={account} months={stats.map((s) => s.mese)} />
        </div>
      )}
      <BalanceTable data={data} account={account} end={end} range={range} />
      <Suggestions data={data} account={account} end={end} range={range === 1 ? 3 : range} />
    </>
  );
}

function Contributions({ data, account, stats }: { data: AppData; account: Account; stats: ReturnType<typeof rangeStats> }) {
  const rows = contributionRows(data, account, stats);
  const s = shares(data, account);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Chi ha messo cosa</h2>
          <p>Versamenti ricevuti rispetto alla parte di spese che spetta a ciascuno ({rows.map((r) => `${Math.round((s[r.conto.id] ?? 0) * 100)}% ${r.conto.titolare || r.conto.nome}`).join(', ')}).</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Conto</th>
              <th className="num">Versato</th>
              <th className="num">Sua parte</th>
              <th className="num">Differenza</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.versato - r.carico;
              return (
                <tr key={r.conto.id}>
                  <td>{r.conto.nome}</td>
                  <td className="num">{formatEuro(r.versato)}</td>
                  <td className="num">{formatEuro(r.carico)}</td>
                  <td className={`num ${diff < 0 ? 'text-bad' : 'text-good'}`}>
                    {diff > 0 ? '+' : ''}
                    {formatEuro(diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Una differenza positiva resta sul conto come risparmio comune; una negativa vuol dire che le spese sono state coperte dal saldo o dai versamenti degli altri.
      </p>
    </div>
  );
}

function PlannedVsUnplanned({ account, months }: { account: Account; months: MonthKey[] }) {
  const set = new Set(months);
  const tx = account.movimenti.filter((t) => set.has(t.data.slice(0, 7)));
  const rows = account.categorie
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

function Trend({ account, end, count }: { account: Account; end: MonthKey; count: number }) {
  const months = lastMonths(end, count);
  const totals = new Map<string, Cents>();
  for (const t of account.movimenti) if (months.includes(t.data.slice(0, 7))) totals.set(t.categoriaId, (totals.get(t.categoriaId) ?? 0) + t.importo);
  // Al massimo 7 categorie con il proprio colore; le altre confluiscono in "Altre".
  const ranked = account.categorie.filter((c) => totals.get(c.id)).sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
  const shown = ranked.length > 8 ? ranked.slice(0, 7) : ranked;
  const others = new Set(ranked.slice(shown.length).map((c) => c.id));
  const series = shown.map((c) => ({ key: c.id, label: c.nome, color: c.colore }));
  if (others.size) series.push({ key: 'altre', label: 'Altre', color: '#898781' });
  const columns: ColumnDatum[] = months.map((m) => {
    const values: Record<string, Cents> = {};
    for (const t of account.movimenti) {
      if (t.data.slice(0, 7) !== m) continue;
      const key = others.has(t.categoriaId) ? 'altre' : t.categoriaId;
      values[key] = (values[key] ?? 0) + t.importo;
    }
    const plan = account.piani[m];
    return { key: m, label: monthShortLabel(m), values, reference: plan ? sum(Object.values(plan.budget), (b) => b) : undefined };
  });
  if (ranked.length === 0) return null;
  return (
    <div className="card section-gap">
      <div className="card-head">
        <div>
          <h2>Andamento mensile delle spese</h2>
          <p>
            Ultimi {count} mesi fino a {monthLabel(end).toLowerCase()}, per categoria.
          </p>
        </div>
      </div>
      <StackedColumns data={columns} series={series} referenceLabel="Budget del mese" />
    </div>
  );
}

function BalanceTable({ data, account, end, range }: { data: AppData; account: Account; end: MonthKey; range: number }) {
  const history = balanceHistory(data, account, end, today()).slice(-Math.max(range, 3));
  return (
    <div className="card section-gap">
      <div className="card-head">
        <div>
          <h2>Saldo stimato</h2>
          <p>
            Dal saldo iniziale di {monthLabel(account.meseSaldoIniziale).toLowerCase()} ({formatEuro(account.saldoIniziale)}): entrano stipendio e versamenti ricevuti,
            escono quote versate, spese e anticipi. Il saldo iniziale si imposta nel modello del conto.
          </p>
        </div>
      </div>
      {history.length === 0 ? (
        <p className="muted">Il saldo iniziale è impostato su un mese successivo.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mese</th>
                <th className="num">Entrate</th>
                <th className="num">Uscite</th>
                <th className="num">Differenza</th>
                <th className="num">Saldo a fine mese</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.mese}>
                  <td>{monthLabel(h.mese)}</td>
                  <td className="num">{formatEuro(h.entrate)}</td>
                  <td className="num">{formatEuro(h.uscite)}</td>
                  <td className={`num ${h.entrate - h.uscite < 0 ? 'text-bad' : ''}`}>{formatEuro(h.entrate - h.uscite)}</td>
                  <td className="num">
                    <strong className={h.saldo < 0 ? 'text-bad' : undefined}>{formatEuro(h.saldo)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Suggestions({ data, account, end, range }: { data: AppData; account: Account; end: MonthKey; range: number }) {
  // Il mese in corso è incompleto: falserebbe le medie verso il basso.
  const inProgress = end === currentMonth();
  const suggestions = budgetSuggestions(data, account, inProgress ? addMonths(end, -1) : end, range);
  const freed = sum(suggestions.filter((s) => s.kind === 'riduci'), (s) => s.budget - s.proposto);
  const needed = sum(suggestions.filter((s) => s.kind !== 'riduci'), (s) => s.proposto - s.budget);
  const behind = data.obiettivi
    .filter((g) => !g.archiviato)
    .map((g) => ({ g, p: projectGoal(g, end) }))
    .filter(({ p }) => p.status === 'in-ritardo');

  // Aggiorna il modello; nei piani del mese e del successivo il budget copre comunque le spese previste.
  const apply = (categoriaId: string, value: Cents) =>
    mutate((d) => {
      const a = d.conti.find((x) => x.id === account.id);
      if (!a) return;
      a.modello.budget[categoriaId] = value;
      for (const m of [end, addMonths(end, 1)]) {
        const plan = a.piani[m];
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
          <p>
            Budget del modello confrontato con il fabbisogno reale: spese estemporanee medie degli ultimi {range} mesi{inProgress ? ' conclusi' : ''} più la quota mensile
            delle ricorrenze.
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
                  I budget sottostimati richiedono <strong>{formatEuro(needed)} al mese</strong> in più: è il costo reale delle abitudini.{' '}
                </>
              )}
              {freed > needed && behind.length > 0 && (
                <>
                  Il saldo positivo di {formatEuro(freed - needed)} potrebbe andare a <strong>{behind[0]!.g.nome}</strong>, che per rispettare la scadenza richiede{' '}
                  {formatEuro(behind[0]!.p.requiredMonthly ?? 0)} al mese.
                </>
              )}
              {needed > freed && ' Valuta se ridurre una spesa discrezionale o rivedere le quote verso gli altri conti.'}
            </Notice>
          </div>
          <p className="small muted">"Applica" aggiorna il modello del conto e i piani di {monthLabel(end).toLowerCase()} e del mese successivo, se esistono.</p>
        </>
      )}
    </div>
  );
}
