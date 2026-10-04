import { useState } from 'react';
import { newId } from '../domain/id';
import {
  averageJointNeed,
  balanceHistory,
  currentBalance,
  jointAccountId,
  jointCategoryRows,
  jointMonthSummary,
  jointPeriodStats,
  myContribution,
  myShare,
  personName,
  splitAmount,
  splitRuleLabels,
} from '../domain/joint';
import { formatEuro, percent, sum } from '../domain/money';
import { currentMonth, dateLabel, lastMonths, monthLabel, monthShortLabel } from '../domain/month';
import { missingRecurring } from '../domain/plan';
import type { AppData, Cents, JointTransaction, MonthKey, Partner, PlannedExpense, SplitRule } from '../domain/types';
import {
  alignContributions,
  createJointMonthPlan,
  deleteJointCategory,
  deleteJointPlan,
  deleteJointRecurring,
  payJointPlanned,
  removeJointPlanned,
  saveJointBudgetAsTemplate,
  saveJointCategory,
  saveJointRecurring,
  setJointTemplateBudget,
  setMyJointDone,
  setPartnerDone,
  setReimbursed,
  syncJointRecurring,
  unpayJointPlanned,
  updateJointPlan,
  updateJointSettings,
} from '../store/jointActions';
import { useData } from '../store/store';
import { BudgetBars, StackedColumns, type ColumnDatum } from '../ui/charts';
import { CategoryDot, ConfirmButton, Field, IconButton, Link, Meter, Money, MoneyInput, MonthSwitcher, Notice, Segmented, Stat } from '../ui/components';
import { Icon } from '../ui/icons';
import { CategoriesSection, RecurringSection } from '../ui/listEditors';
import { PlannedModal } from '../ui/PlannedModal';
import { useOpenTransaction } from '../ui/quickAdd';
import { navigate } from '../ui/router';
import { TransactionsBrowser } from './Movimenti';

type Tab = 'mese' | 'spese' | 'analisi' | 'impostazioni';
const tabs: { value: Tab; label: string }[] = [
  { value: 'mese', label: 'Mese' },
  { value: 'spese', label: 'Spese' },
  { value: 'analisi', label: 'Analisi' },
  { value: 'impostazioni', label: 'Impostazioni' },
];

export function Cointestato({ tab: rawTab, month = currentMonth() }: { tab?: string; month?: MonthKey }) {
  const data = useData();
  const tab: Tab = tabs.some((t) => t.value === rawTab) ? (rawTab as Tab) : 'mese';
  const go = (t: Tab, m: MonthKey = month) => navigate(`cointestato/${t}/${m}`);
  const partner = personName(data, 'partner');
  const isNew = Object.keys(data.cointestato.piani).length === 0 && data.cointestato.movimenti.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Conto cointestato</h1>
          <p>Le spese comuni con {partner}: chi versa quanto, dove vanno i soldi, quanto resta sul conto.</p>
        </div>
        {(tab === 'mese' || tab === 'spese' || tab === 'analisi') && <MonthSwitcher month={month} onChange={(m) => go(tab, m)} />}
      </div>
      <div style={{ marginBottom: 16 }}>
        <Segmented<Tab> label="Sezione del conto cointestato" value={tab} onChange={(t) => go(t)} options={tabs} />
      </div>
      {isNew && tab !== 'impostazioni' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <Notice>
            Per iniziare imposta nelle{' '}
            <Link to={`cointestato/impostazioni/${month}`}>impostazioni del conto</Link> come dividete le spese, il budget comune e le spese fisse (affitto,
            bollette…). Poi crea il piano del mese.
          </Notice>
        </div>
      )}
      {tab === 'mese' && <MonthTab data={data} month={month} />}
      {tab === 'spese' && <ExpensesTab data={data} month={month} />}
      {tab === 'analisi' && <AnalysisTab data={data} end={month} />}
      {tab === 'impostazioni' && <SettingsTab data={data} />}
    </>
  );
}

// ---------- Mese ----------

function ruleDescription(data: AppData): string {
  const s = data.cointestato.impostazioni;
  const mine = Math.round(myShare(s) * 100);
  return `${splitRuleLabels[s.regola]}: ${mine}% ${personName(data, 'io')}, ${100 - mine}% ${personName(data, 'partner')}`;
}

function MonthTab({ data, month }: { data: AppData; month: MonthKey }) {
  const plan = data.cointestato.piani[month];
  const saldo = currentBalance(data, month);
  const [editingPlanned, setEditingPlanned] = useState<PlannedExpense | null>(null);

  if (!plan)
    return (
      <>
        <div className="card empty">
          <h2>Nessun piano comune per {monthLabel(month)}</h2>
          <p>Il piano parte dal budget comune del modello e aggiunge le spese ricorrenti del mese (affitto, bollette…).</p>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn primary" onClick={() => createJointMonthPlan(month)}>
              <Icon name="plus" /> Crea il piano del mese
            </button>
            <Link className="btn" to={`cointestato/impostazioni/${month}`}>
              Imposta il modello
            </Link>
          </div>
        </div>
        <Reimbursements data={data} />
      </>
    );

  const summary = jointMonthSummary(data, month);
  const rows = jointCategoryRows(data, month);
  const missing = missingRecurring(plan, data.cointestato.ricorrenze);
  const underBudget = rows.filter((r) => r.previsto > r.budget);
  const mine = myContribution(data, month);
  const totalIn = summary.versamenti.io.importo + summary.versamenti.partner.importo;
  const misaligned = summary.versamenti.io.importo !== summary.quote.io || summary.versamenti.partner.importo !== summary.quote.partner;
  const update = (recipe: Parameters<typeof updateJointPlan>[1]) => updateJointPlan(month, recipe);
  const da = summary.daRimborsare.io + summary.daRimborsare.partner;

  return (
    <div className="stack">
      <div className="grid grid-4">
        <Stat
          label="Saldo del conto"
          value={<Money value={saldo} className={saldo < 0 ? 'text-bad' : undefined} />}
          hint="Con i versamenti segnati e le spese uscite dal conto"
        />
        <Stat label="Budget comune" value={<Money value={summary.budget} />} hint={`di cui previste ${formatEuro(summary.previste)}`} />
        <Stat
          label="Speso"
          value={<Money value={summary.speso} />}
          hint={summary.residuo >= 0 ? `restano ${formatEuro(summary.residuo)}` : `oltre il budget di ${formatEuro(-summary.residuo)}`}
        />
        <Stat label="Da rimborsare" value={<Money value={da} />} hint={da ? 'Spese anticipate di tasca propria' : 'Nessuna spesa anticipata'} />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Versamenti del mese</h2>
            <p>{ruleDescription(data)}. Le quote coprono il budget comune di {formatEuro(summary.budget)}.</p>
          </div>
          {misaligned && (
            <button type="button" className="btn small primary" onClick={() => alignContributions(month)}>
              Allinea alle quote
            </button>
          )}
        </div>
        <ul className="list">
          {(['io', 'partner'] as Partner[]).map((who) => {
            const off = summary.versamenti[who].importo !== summary.quote[who];
            return (
              <li key={who} className="list-item wrap-mobile">
                <Icon name="up" />
                <div className="grow">
                  <div className="title">{personName(data, who)}</div>
                  <div className="sub">
                    Quota calcolata {formatEuro(summary.quote[who])}
                    {who === 'io' &&
                      (mine.hasPlan ? (
                        <>
                          {' · '}dal tuo <Link to={`piano/${month}`}>piano personale</Link>
                        </>
                      ) : (
                        ' · il tuo piano personale del mese non esiste ancora'
                      ))}
                  </div>
                </div>
                {who === 'io' ? (
                  <strong className={`num ${off ? 'text-bad' : ''}`}>{formatEuro(summary.versamenti.io.importo)}</strong>
                ) : (
                  <div style={{ width: 120 }}>
                    <MoneyInput
                      className={`compact ${off ? 'text-bad' : ''}`}
                      ariaLabel={`Versamento ${personName(data, 'partner')}`}
                      value={plan.versamentoPartner.importo}
                      onChange={(importo) => update((p) => void (p.versamentoPartner.importo = importo))}
                    />
                  </div>
                )}
                <label className="check small">
                  <input
                    type="checkbox"
                    checked={summary.versamenti[who].eseguito}
                    disabled={who === 'io' && mine.ids.length === 0}
                    onChange={(e) => (who === 'io' ? setMyJointDone(month, e.target.checked) : setPartnerDone(month, e.target.checked))}
                  />
                  Versato
                </label>
              </li>
            );
          })}
        </ul>
        <div className="split small" style={{ borderTop: '1px solid var(--axis)', paddingTop: 8 }}>
          <span className="muted">
            Previsti {formatEuro(totalIn)} · versati {formatEuro(summary.versato)}
          </span>
          <span className="muted">Quote {formatEuro(summary.quote.io + summary.quote.partner)}</span>
        </div>
        {totalIn < summary.budget && (
          <div className="section-gap">
            <Notice kind="warn">
              I versamenti previsti sono {formatEuro(summary.budget - totalIn)} sotto il budget comune: se lo spendete tutto, il saldo del conto scenderà.
            </Notice>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Budget comune</h2>
            <p>
              Speso {formatEuro(summary.speso)} su {formatEuro(summary.budget)}.
            </p>
          </div>
          <div className="actions">
            {underBudget.length > 0 && (
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  update((p) => {
                    for (const r of underBudget) p.budget[r.categoria.id] = r.previsto;
                  })
                }
              >
                Copri le spese previste
              </button>
            )}
            <ConfirmButton className="btn small" question="Usarlo per i prossimi mesi?" confirmLabel="Salva" onConfirm={() => saveJointBudgetAsTemplate(month)}>
              Salva come modello
            </ConfirmButton>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="num" style={{ width: 130 }}>
                  Budget
                </th>
                <th className="num hide-mobile">Previsto</th>
                <th className="num">Speso</th>
                <th className="hide-mobile" style={{ width: '22%' }}>
                  Utilizzo
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.categoria.id}>
                  <td>
                    <span className="actions" style={{ flexWrap: 'nowrap' }}>
                      <CategoryDot color={r.categoria.colore} />
                      {r.categoria.nome}
                    </span>
                    {r.previsto > r.budget && <div className="small text-bad">Previste oltre il budget</div>}
                  </td>
                  <td className="num">
                    <MoneyInput
                      className="compact"
                      value={r.budget}
                      ariaLabel={`Budget ${r.categoria.nome}`}
                      onChange={(v: Cents) =>
                        update((p) => {
                          if (v) p.budget[r.categoria.id] = v;
                          else delete p.budget[r.categoria.id];
                        })
                      }
                    />
                  </td>
                  <td className="num hide-mobile muted">{r.previsto ? formatEuro(r.previsto) : '—'}</td>
                  <td className={`num ${r.speso > r.budget ? 'text-bad' : ''}`}>{formatEuro(r.speso)}</td>
                  <td className="hide-mobile">
                    <Meter value={r.speso} max={r.budget} label={`Utilizzo budget ${r.categoria.nome}`} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Totale</td>
                <td className="num">{formatEuro(summary.budget)}</td>
                <td className="num hide-mobile">{formatEuro(summary.previste)}</td>
                <td className="num">{formatEuro(summary.speso)}</td>
                <td className="hide-mobile" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Spese previste comuni</h2>
            <p>
              Pagate {formatEuro(summary.previstePagate)}, da pagare {formatEuro(summary.previste - summary.previstePagate)}.
            </p>
          </div>
          <div className="actions">
            {missing.length > 0 && (
              <button type="button" className="btn small" onClick={() => syncJointRecurring(month)}>
                <Icon name="repeat" /> Aggiungi {missing.length} ricorrenz{missing.length === 1 ? 'a' : 'e'}
              </button>
            )}
            <button
              type="button"
              className="btn small primary"
              onClick={() => setEditingPlanned({ id: newId(), descrizione: '', categoriaId: data.cointestato.categorie[0]?.id ?? '', importo: 0 })}
            >
              <Icon name="plus" /> Spesa prevista
            </button>
          </div>
        </div>
        {plan.spesePreviste.length === 0 ? (
          <p className="muted">Nessuna spesa prevista. Aggiungi affitto, bollette e abbonamenti comuni come spese ricorrenti nelle impostazioni del conto.</p>
        ) : (
          <ul className="list">
            {[...plan.spesePreviste]
              .sort((a, b) => (a.giorno ?? 99) - (b.giorno ?? 99))
              .map((p) => {
                const categoria = data.cointestato.categorie.find((c) => c.id === p.categoriaId);
                return (
                  <li key={p.id} className="list-item wrap-mobile">
                    <CategoryDot color={categoria?.colore ?? 'var(--axis)'} />
                    <div className="grow">
                      <div className="title">
                        {p.descrizione} {p.ricorrenzaId && <span className="badge">ricorrente</span>}
                      </div>
                      <div className="sub">
                        {categoria?.nome ?? 'Senza categoria'}
                        {p.giorno ? ` · giorno ${p.giorno}` : ''}
                      </div>
                    </div>
                    <strong className="num">{formatEuro(p.importo)}</strong>
                    {p.movimentoId ? (
                      <button type="button" className="btn small" onClick={() => unpayJointPlanned(month, p.id)} title="Annulla pagamento">
                        <span className="text-good">
                          <Icon name="check" />
                        </span>
                        Pagata
                      </button>
                    ) : (
                      <button type="button" className="btn small primary" onClick={() => payJointPlanned(month, p.id)}>
                        Segna pagata
                      </button>
                    )}
                    <IconButton icon="edit" label="Modifica" onClick={() => setEditingPlanned(p)} />
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      <Reimbursements data={data} />

      <div className="card">
        <Field label="Note del mese">
          <textarea
            className="input"
            rows={2}
            value={plan.note ?? ''}
            placeholder="Es. conguaglio gas, regalo di nozze per amici comuni…"
            onChange={(e) => update((p) => void (p.note = e.target.value || undefined))}
          />
        </Field>
        <div className="actions section-gap">
          <ConfirmButton className="btn small danger" question="Le spese registrate restano." confirmLabel="Elimina piano" onConfirm={() => deleteJointPlan(month)}>
            Elimina il piano del mese
          </ConfirmButton>
        </div>
      </div>

      <PlannedModal
        planned={editingPlanned}
        categorie={data.cointestato.categorie}
        exists={!!editingPlanned && plan.spesePreviste.some((x) => x.id === editingPlanned.id)}
        onSave={(p) =>
          update((draft) => {
            const i = draft.spesePreviste.findIndex((x) => x.id === p.id);
            if (i >= 0) draft.spesePreviste[i] = p;
            else draft.spesePreviste.push(p);
          })
        }
        onRemove={(id) => removeJointPlanned(month, id)}
        recurringHint="Per cambiare tutti i mesi modifica la spesa ricorrente nelle impostazioni del conto."
        onClose={() => setEditingPlanned(null)}
      />
    </div>
  );
}

/** Spese comuni pagate di tasca propria e non ancora rimborsate dal conto (tutti i mesi). */
function Reimbursements({ data }: { data: AppData }) {
  const pending = data.cointestato.movimenti.filter((t) => t.pagatoDa !== 'conto' && !t.rimborsato).sort((a, b) => a.data.localeCompare(b.data));
  if (pending.length === 0) return null;
  const totals = (['io', 'partner'] as Partner[])
    .map((who) => ({ who, value: sum(pending.filter((t) => t.pagatoDa === who), (t) => t.importo) }))
    .filter((x) => x.value > 0);
  return (
    <div className="card section-gap">
      <div className="card-head">
        <div>
          <h2>Spese anticipate da rimborsare</h2>
          <p>
            Il conto deve restituire {totals.map((x) => `${formatEuro(x.value)} a ${personName(data, x.who)}`).join(' e ')}. Segna "Rimborsata" quando fate il
            bonifico dal conto.
          </p>
        </div>
      </div>
      <ul className="list">
        {pending.map((t) => (
          <li key={t.id} className="list-item wrap-mobile">
            <Icon name="wallet" />
            <div className="grow">
              <div className="title">{t.descrizione}</div>
              <div className="sub">
                {dateLabel(t.data)} {t.data.slice(0, 4)} · anticipata da {personName(data, t.pagatoDa as Partner)}
              </div>
            </div>
            <strong className="num">{formatEuro(t.importo)}</strong>
            <button type="button" className="btn small" onClick={() => setReimbursed(t.id, true)}>
              Rimborsata
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Spese ----------

function payerBadge(data: AppData, t: JointTransaction) {
  if (t.pagatoDa === 'conto') return null;
  const name = personName(data, t.pagatoDa);
  return t.rimborsato ? <span className="badge">rimborsata a {name}</span> : <span className="badge bad">anticipata da {name}</span>;
}

function ExpensesTab({ data, month }: { data: AppData; month: MonthKey }) {
  const openTransaction = useOpenTransaction();
  return (
    <TransactionsBrowser
      transactions={data.cointestato.movimenti}
      categorie={data.cointestato.categorie}
      month={month}
      onOpen={(t) => openTransaction(t, 'comune')}
      onAdd={(partial) => openTransaction(partial, 'comune')}
      badge={(t) => payerBadge(data, t)}
    />
  );
}

// ---------- Analisi ----------

type Range = 3 | 6 | 12;

function AnalysisTab({ data, end }: { data: AppData; end: MonthKey }) {
  const [range, setRange] = useState<Range>(6);
  const stats = jointPeriodStats(data, end, range);
  const joint = data.cointestato;
  const months = stats.mesi.length;
  const rangeControl = (
    <div style={{ marginBottom: 16 }}>
      <Segmented<Range>
        label="Periodo"
        value={range}
        onChange={setRange}
        options={[
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
        {rangeControl}
        <div className="card empty">
          <h2>Ancora nessun dato in questo periodo</h2>
          <p>Crea il piano comune del mese e registra le spese per vedere le analisi.</p>
        </div>
      </>
    );

  const avg = (v: Cents) => Math.round(v / months);
  const tx = joint.movimenti.filter((t) => stats.mesi.includes(t.data.slice(0, 7)));
  const estemporaneo = sum(tx.filter((t) => !t.previstaId), (t) => t.importo);
  const history = balanceHistory(data, end).slice(-range);
  const ranked = joint.categorie.filter((c) => stats.perCategoria[c.id]).sort((a, b) => (stats.perCategoria[b.id] ?? 0) - (stats.perCategoria[a.id] ?? 0));
  const columns: ColumnDatum[] = lastMonths(end, range).map((m) => {
    const values: Record<string, Cents> = {};
    for (const t of joint.movimenti) if (t.data.slice(0, 7) === m) values[t.categoriaId] = (values[t.categoriaId] ?? 0) + t.importo;
    const plan = joint.piani[m];
    return { key: m, label: monthShortLabel(m), values, reference: plan ? sum(Object.values(plan.budget), (b) => b) : undefined };
  });

  return (
    <>
      {rangeControl}
      <p className="muted small" style={{ marginTop: -8 }}>
        {monthLabel(stats.mesi[0]!)} – {monthLabel(stats.mesi[months - 1]!)} · {months} {months === 1 ? 'mese' : 'mesi'} con dati · valori medi mensili
        {end === currentMonth() && ' · il mese in corso non è ancora concluso'}
      </p>
      <div className="grid grid-4">
        <Stat label="Spese comuni medie" value={formatEuro(avg(stats.speso))} />
        <Stat label={`Costo per ${personName(data, 'io')}`} value={formatEuro(avg(stats.carico.io))} hint={`${Math.round(myShare(joint.impostazioni) * 100)}% secondo la regola`} />
        <Stat label={`Costo per ${personName(data, 'partner')}`} value={formatEuro(avg(stats.carico.partner))} />
        <Stat label="Spese estemporanee" value={`${percent(estemporaneo, stats.speso)}%`} hint={`${formatEuro(avg(estemporaneo))} al mese non pianificati`} />
      </div>

      <div className="grid grid-2 section-gap">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Budget e speso per categoria</h2>
              <p>Media mensile del periodo.</p>
            </div>
          </div>
          <BudgetBars
            rows={ranked
              .concat(joint.categorie.filter((c) => !stats.perCategoria[c.id] && stats.mesi.some((m) => joint.piani[m]?.budget[c.id])))
              .map((c) => ({
                key: c.id,
                label: c.nome,
                color: c.colore,
                value: avg(stats.perCategoria[c.id] ?? 0),
                budget: avg(sum(stats.mesi, (m) => joint.piani[m]?.budget[c.id] ?? 0)),
              }))}
          />
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Chi ha messo cosa</h2>
              <p>Versamenti segnati come eseguiti rispetto alla quota di spese che spetta a ciascuno.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Chi</th>
                  <th className="num">Versato</th>
                  <th className="num">Sua parte di spese</th>
                  <th className="num">Differenza</th>
                </tr>
              </thead>
              <tbody>
                {(['io', 'partner'] as Partner[]).map((who) => {
                  const diff = stats.versato[who] - stats.carico[who];
                  return (
                    <tr key={who}>
                      <td>{personName(data, who)}</td>
                      <td className="num">{formatEuro(stats.versato[who])}</td>
                      <td className="num">{formatEuro(stats.carico[who])}</td>
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
            Una differenza positiva resta sul conto come risparmio comune; una negativa vuol dire che le spese sono state coperte dal saldo o dai versamenti
            dell'altra persona.
          </p>
        </div>
      </div>

      <div className="card section-gap">
        <div className="card-head">
          <div>
            <h2>Andamento delle spese comuni</h2>
            <p>Ultimi {range} mesi per categoria, con il budget del mese.</p>
          </div>
        </div>
        <StackedColumns data={columns} series={ranked.map((c) => ({ key: c.id, label: c.nome, color: c.colore }))} referenceLabel="Budget comune" />
      </div>

      <div className="card section-gap">
        <div className="card-head">
          <div>
            <h2>Saldo del conto</h2>
            <p>Dal saldo iniziale di {monthLabel(joint.impostazioni.meseSaldoIniziale).toLowerCase()}: entrano i versamenti eseguiti, escono le spese pagate dal conto e i rimborsi.</p>
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
                      <strong>{formatEuro(h.saldo)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ---------- Impostazioni ----------

const roundingOptions: { value: Cents; label: string }[] = [
  { value: 1, label: 'Al centesimo' },
  { value: 100, label: '1 €' },
  { value: 500, label: '5 €' },
  { value: 1000, label: '10 €' },
  { value: 5000, label: '50 €' },
];

function SettingsTab({ data }: { data: AppData }) {
  const joint = data.cointestato;
  const s = joint.impostazioni;
  const partner = personName(data, 'partner');
  const me = personName(data, 'io');
  const templateTotal = sum(Object.values(joint.modelloBudget), (v) => v);
  const need = averageJointNeed(data);
  const preview = splitAmount(s, need);
  const mySalary = sum(data.modello.entrate, (e) => e.importo);
  const accounts = data.conti.filter((c) => c.tipo === 'cointestato');
  const contoId = jointAccountId(data);

  return (
    <div className="stack">
      <div className="card">
        <h2 style={{ marginBottom: 4 }}>Come dividete le spese</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          La regola calcola ogni mese quanto deve versare ciascuno sul conto per coprire il budget comune.
        </p>
        <div className="form-grid">
          <Field label="Nome della persona con cui condividi il conto">
            <input className="input" value={s.nomePartner} onChange={(e) => updateJointSettings({ nomePartner: e.target.value })} />
          </Field>
          <Field label="Regola di ripartizione">
            <select className="input" value={s.regola} onChange={(e) => updateJointSettings({ regola: e.target.value as SplitRule })}>
              {Object.entries(splitRuleLabels).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {s.regola === 'proporzionale' && (
            <>
              <Field label={`Stipendio netto di ${me} (€/mese)`} hint={mySalary && mySalary !== s.redditoIo ? `Nel tuo modello: ${formatEuro(mySalary)}` : undefined}>
                <MoneyInput value={s.redditoIo} onChange={(redditoIo) => updateJointSettings({ redditoIo })} />
              </Field>
              <Field label={`Stipendio netto di ${partner} (€/mese)`}>
                <MoneyInput value={s.redditoPartner} onChange={(redditoPartner) => updateJointSettings({ redditoPartner })} />
              </Field>
            </>
          )}
          {s.regola === 'percentuale' && (
            <Field label={`Quota a carico di ${me} (%)`}>
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={s.percentualeIo}
                onChange={(e) => updateJointSettings({ percentualeIo: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
              />
            </Field>
          )}
          <Field label="Arrotonda le quote per eccesso a">
            <select className="input" value={s.arrotondamento} onChange={(e) => updateJointSettings({ arrotondamento: Number(e.target.value) })}>
              {roundingOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {s.regola === 'proporzionale' && mySalary > 0 && mySalary !== s.redditoIo && (
          <button type="button" className="btn small section-gap" onClick={() => updateJointSettings({ redditoIo: mySalary })}>
            Usa il mio stipendio dal modello
          </button>
        )}
        <div className="section-gap">
          <Notice>
            {ruleDescription(data)}. Con un fabbisogno medio di {formatEuro(need)} al mese (budget del modello più spese ricorrenti) {me} versa circa{' '}
            <strong>{formatEuro(preview.io)}</strong> e {partner} <strong>{formatEuro(preview.partner)}</strong>. Ogni mese le quote si ricalcolano sul piano
            effettivo.
          </Notice>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ marginBottom: 12 }}>Conto e saldo iniziale</h2>
          <div className="form-grid">
            <Field label="Conto cointestato" full hint={accounts.length ? undefined : 'Aggiungi un conto di tipo "Cointestato" nelle Impostazioni generali.'}>
              <select className="input" value={contoId ?? ''} onChange={(e) => updateJointSettings({ contoId: e.target.value || undefined })}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Saldo iniziale (€)">
              <MoneyInput value={s.saldoIniziale} onChange={(saldoIniziale) => updateJointSettings({ saldoIniziale })} />
            </Field>
            <Field label="All'inizio di">
              <input className="input" type="month" value={s.meseSaldoIniziale} onChange={(e) => e.target.value && updateJointSettings({ meseSaldoIniziale: e.target.value })} />
            </Field>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Il saldo viene aggiornato con i versamenti segnati come eseguiti e le spese uscite dal conto. Il tuo versamento è la quota verso questo conto nel tuo
            piano personale.
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Budget comune del modello</h2>
              <p>
                Il punto di partenza di ogni piano comune: {formatEuro(templateTotal)}/mese. Le spese ricorrenti si aggiungono da sole, alzando il budget della loro
                categoria quando serve.
              </p>
            </div>
          </div>
          <div className="rows">
            {joint.categorie
              .filter((c) => !c.archiviata)
              .map((c) => (
                <div key={c.id} className="inline-row" style={{ gridTemplateColumns: '1fr 120px' }}>
                  <span className="actions" style={{ flexWrap: 'nowrap' }}>
                    <CategoryDot color={c.colore} />
                    {c.nome}
                  </span>
                  <MoneyInput className="compact" value={joint.modelloBudget[c.id] ?? 0} ariaLabel={`Budget comune ${c.nome}`} onChange={(v) => setJointTemplateBudget(c.id, v)} />
                </div>
              ))}
          </div>
        </div>
      </div>

      <RecurringSection
        ricorrenze={joint.ricorrenze}
        categorie={joint.categorie}
        onSave={saveJointRecurring}
        onDelete={deleteJointRecurring}
        title="Spese comuni ricorrenti"
        description="Affitto o rata del mutuo, bollette, internet, condominio: entrano da sole nel piano comune dei mesi giusti."
        placeholder="Es. affitto, bolletta luce e gas"
      />
      <CategoriesSection
        categorie={joint.categorie}
        onSave={saveJointCategory}
        onDelete={deleteJointCategory}
        title="Categorie comuni"
        description="Per le spese pagate dal conto cointestato."
      />
    </div>
  );
}
