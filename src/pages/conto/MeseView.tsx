import { useState } from 'react';
import { palette } from '../../domain/defaults';
import { newId } from '../../domain/id';
import {
  activeAccounts,
  anticipatedFor,
  byDate,
  categoryRows,
  findAccount,
  incomingTransfers,
  missingRecurring,
  participants,
  plannedContributions,
  shares,
  splitAmount,
  summarizePlan,
  transactionsOfMonth,
} from '../../domain/ledger';
import { formatEuro, percent } from '../../domain/money';
import { addMonths, dateLabel, daysInMonth, monthLabel, today } from '../../domain/month';
import type { Account, AppData, Cents, MonthKey, MonthPlan, PlannedExpense } from '../../domain/types';
import {
  alignContributions,
  copyPlanFrom,
  createMonthPlan,
  deletePlan,
  payPlanned,
  removePlanned,
  removeTransfer,
  saveAsTemplate,
  savePlanned,
  setReimbursed,
  setTransferDone,
  syncRecurring,
  unpayPlanned,
  updatePlan,
} from '../../store/actions';
import { MonthCalendar } from '../../ui/Calendar';
import { FlowBar } from '../../ui/charts';
import { CategoryDot, ConfirmButton, Field, IconButton, Link, Meter, Money, MoneyInput, Notice, Segmented, Stat } from '../../ui/components';
import { IncomeEditor, TransferEditor } from '../../ui/editors';
import { Icon } from '../../ui/icons';
import { PlannedModal } from '../../ui/PlannedModal';

export function MeseView({ data, account, month }: { data: AppData; account: Account; month: MonthKey }) {
  const plan = account.piani[month];
  if (!plan) return <NoPlan account={account} month={month} />;
  return <PlanView data={data} account={account} plan={plan} />;
}

function NoPlan({ account, month }: { account: Account; month: MonthKey }) {
  const previous = account.piani[addMonths(month, -1)];
  return (
    <div className="card empty">
      <h2>Nessun piano per {monthLabel(month)}</h2>
      <p>Il piano nasce dal modello del conto e include da solo le spese ricorrenti del mese.</p>
      <div className="actions" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn primary" onClick={() => createMonthPlan(account.id, month)}>
          <Icon name="plus" /> Crea dal modello
        </button>
        {previous && (
          <button type="button" className="btn" onClick={() => copyPlanFrom(account.id, month, addMonths(month, -1))}>
            <Icon name="copy" /> Copia da {monthLabel(addMonths(month, -1))}
          </button>
        )}
        <Link className="btn" to={`conto/${account.id}/modello/${month}`}>
          Vai al modello
        </Link>
      </div>
    </div>
  );
}

function PlanView({ data, account, plan }: { data: AppData; account: Account; plan: MonthPlan }) {
  const month = plan.mese;
  const tx = transactionsOfMonth(account.movimenti, month);
  const summary = summarizePlan(data, account, month);
  const rows = categoryRows(plan, tx, account.categorie);
  const missing = missingRecurring(plan, account.ricorrenze);
  const incoming = incomingTransfers(data, account.id, month);
  const [editingPlanned, setEditingPlanned] = useState<PlannedExpense | null>(null);
  const [plannedView, setPlannedView] = useState<'elenco' | 'calendario'>('elenco');
  const update = (recipe: (p: MonthPlan) => void) => updatePlan(account.id, month, recipe);
  const underBudget = rows.filter((r) => r.previsto > r.budget);
  const resources = summary.entrate + summary.inArrivo;
  const isPersonal = account.tipo === 'personale';
  // Su un conto di risparmio ciò che non è assegnato resta accantonato: è lo scopo del conto.
  const isSavings = account.tipo === 'risparmio' || account.tipo === 'investimenti';
  const freeLabel = isSavings ? 'Resta sul conto' : 'Non allocato';
  const isShared = !!account.ripartizione && participants(data, account).length > 0;
  const destinations = activeAccounts(data).filter((a) => a.id !== account.id);

  // Ripartizione teorica delle risorse del mese: una fetta per destinazione, poi budget e margine.
  const byTarget = new Map<string, { label: string; value: Cents }>();
  for (const t of plan.trasferimenti) {
    const key = t.obiettivoId ? `g:${t.obiettivoId}` : `a:${t.contoId ?? ''}`;
    const label = t.obiettivoId
      ? `Obiettivo ${data.obiettivi.find((g) => g.id === t.obiettivoId)?.nome ?? ''}`
      : (findAccount(data, t.contoId)?.nome ?? 'Senza destinazione');
    byTarget.set(key, { label, value: (byTarget.get(key)?.value ?? 0) + t.importo });
  }
  const flow = [
    ...[...byTarget.entries()].map(([key, v], i) => ({ key, label: v.label, value: v.value, color: palette[i % 6]! })),
    { key: 'budget', label: 'Budget spese', value: summary.budget, color: palette[6]! },
    { key: 'libero', label: freeLabel, value: Math.max(0, summary.nonAllocato), color: 'var(--axis)' },
  ];
  const daysLeft = month === today().slice(0, 7) ? daysInMonth(month) - Number(today().slice(8)) + 1 : 0;

  return (
    <div className="stack">
      <div className="grid grid-4">
        {isPersonal ? (
          <Stat
            label="Puoi ancora spendere"
            value={<Money value={summary.residuo} className={summary.residuo < 0 ? 'text-bad' : undefined} />}
            hint={daysLeft && summary.residuo > 0 ? `circa ${formatEuro(Math.floor(summary.residuo / daysLeft))} al giorno` : `su ${formatEuro(summary.budget)} di budget`}
          />
        ) : (
          <Stat label="Speso" value={<Money value={summary.speso} />} hint={summary.residuo >= 0 ? `restano ${formatEuro(summary.residuo)}` : `oltre il budget di ${formatEuro(-summary.residuo)}`} />
        )}
        <Stat label="Entrate" value={<Money value={resources} />} hint={summary.inArrivo ? `di cui ${formatEuro(summary.inArrivo)} da altri conti` : undefined} />
        <Stat
          label="Quote verso altri conti"
          value={<Money value={summary.trasferimenti} />}
          hint={summary.trasferimenti ? `${percent(summary.trasferimenti, resources)}% delle entrate` : undefined}
        />
        <Stat
          label={freeLabel}
          value={<Money value={summary.nonAllocato} className={summary.nonAllocato < 0 ? 'text-bad' : undefined} />}
          hint={summary.nonAllocato < 0 ? 'Il piano supera le entrate' : isSavings ? 'Accantonato questo mese' : 'Margine libero'}
        />
      </div>

      {resources > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Come si dividono le entrate</h2>
              <p>Ripartizione teorica di {monthLabel(month).toLowerCase()}.</p>
            </div>
          </div>
          <FlowBar segments={flow} total={resources} />
          {summary.nonAllocato < 0 && (
            <div className="section-gap">
              <Notice kind="bad">
                Hai pianificato <strong>{formatEuro(-summary.nonAllocato)}</strong> in più di quanto entra. Riduci il budget o le quote da versare.
              </Notice>
            </div>
          )}
        </div>
      )}

      {(incoming.length > 0 || isShared) && <IncomingCard data={data} account={account} month={month} />}

      <div className="grid grid-1-2">
        <div className="card">
          <div className="card-head">
            <h2>Entrate proprie</h2>
            <strong>
              <Money value={summary.entrate} />
            </strong>
          </div>
          <IncomeEditor
            lines={plan.entrate}
            onChange={(i, patch) =>
              update((p) => {
                if (patch === null) p.entrate.splice(i, 1);
                else Object.assign(p.entrate[i]!, patch);
              })
            }
            onAdd={() => update((p) => p.entrate.push({ id: newId(), descrizione: isPersonal ? 'Entrata extra' : 'Entrata', importo: 0 }))}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Quote da versare</h2>
              <p>
                Versate {formatEuro(summary.trasferimentiEseguiti)} su {formatEuro(summary.trasferimenti)}. Scegli il conto o l'obiettivo di destinazione e spunta quando
                hai fatto il bonifico.
              </p>
            </div>
          </div>
          <TransferEditor
            lines={plan.trasferimenti}
            conti={destinations}
            obiettivi={data.obiettivi}
            onChange={(i, patch) => {
              const line = plan.trasferimenti[i]!;
              if (patch === null) return removeTransfer(account.id, month, line.id);
              update((p) => Object.assign(p.trasferimenti[i]!, patch));
              // Se cambia importo o destinazione di una quota già versata, riallinea il versamento sull'obiettivo.
              if (line.eseguito && (patch.importo !== undefined || 'obiettivoId' in patch)) setTransferDone(account.id, month, line.id, true);
            }}
            onAdd={() => update((p) => p.trasferimenti.push({ id: newId(), descrizione: 'Nuova quota', importo: 0, eseguito: false }))}
            onToggleDone={(i, done) => setTransferDone(account.id, month, plan.trasferimenti[i]!.id, done)}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Budget delle spese</h2>
            <p>
              Speso {formatEuro(summary.speso)} su {formatEuro(summary.budget)}.
            </p>
          </div>
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
        </div>
        {rows.length === 0 ? (
          <p className="muted">Questo conto non ha categorie di spesa. Puoi aggiungerle nel modello.</p>
        ) : (
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
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Spese previste</h2>
            <p>
              Pagate {formatEuro(summary.previstePagate)}, da pagare {formatEuro(summary.previsteDaPagare)}.
            </p>
          </div>
          <div className="actions">
            <Segmented
              label="Vista delle spese previste"
              value={plannedView}
              onChange={setPlannedView}
              options={[
                { value: 'elenco', label: 'Elenco' },
                { value: 'calendario', label: 'Calendario' },
              ]}
            />
            {missing.length > 0 && (
              <button type="button" className="btn small" onClick={() => syncRecurring(account.id, month)}>
                <Icon name="repeat" /> Aggiungi {missing.length} ricorrenz{missing.length === 1 ? 'a' : 'e'}
              </button>
            )}
            <button
              type="button"
              className="btn small primary"
              onClick={() => setEditingPlanned({ id: newId(), descrizione: '', categoriaId: account.categorie.find((c) => !c.archiviata)?.id ?? '', importo: 0 })}
            >
              <Icon name="plus" /> Spesa prevista
            </button>
          </div>
        </div>
        {plannedView === 'calendario' ? (
          <MonthCalendar month={month} planned={plan.spesePreviste} transactions={tx} categorie={account.categorie} onPlannedClick={setEditingPlanned} />
        ) : plan.spesePreviste.length === 0 ? (
          <p className="muted">Nessuna spesa prevista. Aggiungi visite, rate o regali, oppure le spese ricorrenti nel modello del conto.</p>
        ) : (
          <ul className="list">
            {[...plan.spesePreviste].sort(byDate).map((p) => {
              const categoria = account.categorie.find((c) => c.id === p.categoriaId);
              const paid = p.movimentoId ? account.movimenti.find((t) => t.id === p.movimentoId) : undefined;
              return (
                <li key={p.id} className="list-item wrap-mobile">
                  <CategoryDot color={categoria?.colore ?? 'var(--axis)'} />
                  <div className="grow">
                    <div className="title">
                      {p.descrizione} {p.ricorrenzaId && <span className="badge">ricorrente</span>}
                    </div>
                    <div className="sub">
                      {p.data ? `${dateLabel(p.data)} · ` : ''}
                      {categoria?.nome ?? 'Senza categoria'}
                      {paid && paid.importo !== p.importo && ` · pagata ${formatEuro(paid.importo)}`}
                    </div>
                  </div>
                  <strong className="num">{formatEuro(p.importo)}</strong>
                  {paid ? (
                    <button type="button" className="btn small" onClick={() => unpayPlanned(account.id, month, p.id)} title="Annulla pagamento">
                      <span className="text-good">
                        <Icon name="check" />
                      </span>
                      Pagata
                    </button>
                  ) : (
                    <button type="button" className="btn small primary" onClick={() => payPlanned(account.id, month, p.id)}>
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

      <Reimbursements data={data} account={account} />

      <div className="card">
        <Field label="Note del mese">
          <textarea
            className="input"
            rows={2}
            value={plan.note ?? ''}
            placeholder="Es. matrimonio di Luca, bollo auto, conguaglio gas…"
            onChange={(e) => update((p) => void (p.note = e.target.value || undefined))}
          />
        </Field>
        <div className="actions section-gap">
          <ConfirmButton className="btn small" question="Usarlo per i prossimi mesi?" confirmLabel="Salva" onConfirm={() => saveAsTemplate(account.id, month)}>
            Salva come modello
          </ConfirmButton>
          <ConfirmButton className="btn small danger" question="Le spese registrate restano." confirmLabel="Elimina piano" onConfirm={() => deletePlan(account.id, month)}>
            Elimina il piano del mese
          </ConfirmButton>
        </div>
      </div>

      <PlannedModal
        planned={editingPlanned}
        month={month}
        categorie={account.categorie}
        exists={!!editingPlanned && plan.spesePreviste.some((x) => x.id === editingPlanned.id)}
        onSave={(p) => savePlanned(account.id, month, p)}
        onRemove={(id) => removePlanned(account.id, month, id)}
        recurringHint="Per cambiare tutti i mesi modifica la spesa ricorrente nel modello del conto."
        onClose={() => setEditingPlanned(null)}
      />
    </div>
  );
}

/** Versamenti che arrivano da altri conti; per un conto condiviso anche le quote calcolate dalla regola. */
function IncomingCard({ data, account, month }: { data: AppData; account: Account; month: MonthKey }) {
  const incoming = incomingTransfers(data, account.id, month);
  const summary = summarizePlan(data, account, month);
  const shared = !!account.ripartizione && participants(data, account).length > 0;
  const quote = shared ? splitAmount(data, account, summary.budget) : {};
  const planned = shared ? plannedContributions(data, account, month) : {};
  const share = shared ? shares(data, account) : {};
  const misaligned = shared && Object.entries(quote).some(([id, q]) => planned[id] && !planned[id]!.eseguito && planned[id]!.importo !== q);
  const fromNonParticipants = incoming.filter((i) => !(i.from.id in quote));

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Versamenti in arrivo</h2>
          <p>
            Previsti {formatEuro(summary.inArrivo)}, ricevuti {formatEuro(summary.inArrivoRicevuti)}.
            {shared &&
              ` Le quote coprono il budget di ${formatEuro(summary.budget)}: ` +
                participants(data, account)
                  .map((a) => `${Math.round((share[a.id] ?? 0) * 100)}% ${a.titolare || a.nome}`)
                  .join(', ') +
                '.'}
          </p>
        </div>
        {misaligned && (
          <button type="button" className="btn small primary" onClick={() => alignContributions(account.id, month)}>
            Allinea alle quote
          </button>
        )}
      </div>
      <ul className="list">
        {shared &&
          participants(data, account).map((p) => {
            const lines = incoming.filter((i) => i.from.id === p.id);
            const c = planned[p.id]!;
            const off = !c.eseguito && c.importo !== quote[p.id];
            return (
              <li key={p.id} className="list-item wrap-mobile">
                <Icon name="down" />
                <div className="grow">
                  <div className="title">{p.nome}</div>
                  <div className="sub">
                    Quota calcolata {formatEuro(quote[p.id] ?? 0)}
                    {c.hasPlan ? (
                      <>
                        {' · '}
                        <Link to={`conto/${p.id}/piano/${month}`}>apri il suo piano</Link>
                      </>
                    ) : (
                      ' · piano del mese non ancora creato'
                    )}
                  </div>
                </div>
                <strong className={`num ${off ? 'text-bad' : ''}`}>{formatEuro(c.importo)}</strong>
                <label className="check small">
                  <input
                    type="checkbox"
                    checked={c.eseguito}
                    disabled={lines.length === 0}
                    onChange={(e) => lines.forEach((i) => setTransferDone(p.id, month, i.line.id, e.target.checked))}
                  />
                  Ricevuto
                </label>
              </li>
            );
          })}
        {fromNonParticipants.map(({ from, line }) => (
          <li key={line.id} className="list-item wrap-mobile">
            <Icon name="down" />
            <div className="grow">
              <div className="title">{line.descrizione}</div>
              <div className="sub">
                Da {from.nome}
                {line.obiettivoId && ` · per l'obiettivo ${data.obiettivi.find((g) => g.id === line.obiettivoId)?.nome ?? ''}`}
              </div>
            </div>
            <strong className="num">{formatEuro(line.importo)}</strong>
            <label className="check small">
              <input type="checkbox" checked={line.eseguito} onChange={(e) => setTransferDone(from.id, month, line.id, e.target.checked)} />
              Ricevuto
            </label>
          </li>
        ))}
      </ul>
      {misaligned && (
        <p className="small muted" style={{ marginBottom: 0 }}>
          "Allinea alle quote" aggiorna la quota verso questo conto nel piano di ciascun partecipante (e lo crea se manca).
        </p>
      )}
      {shared && summary.inArrivo < summary.budget && (
        <div className="section-gap">
          <Notice kind="warn">
            I versamenti previsti sono {formatEuro(summary.budget - summary.inArrivo)} sotto il budget del mese: se lo spendete tutto, il saldo del conto scenderà.
          </Notice>
        </div>
      )}
    </div>
  );
}

/** Spese anticipate: quelle di questo conto pagate da altri, e quelle di altri conti pagate da questo. */
function Reimbursements({ data, account }: { data: AppData; account: Account }) {
  const owed = account.movimenti.filter((t) => t.pagatoDa && !t.rimborsato).sort((a, b) => a.data.localeCompare(b.data));
  const advanced = anticipatedFor(data, account.id).filter((a) => !a.tx.rimborsato);
  if (owed.length === 0 && advanced.length === 0) return null;
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Spese anticipate</h2>
          <p>Segna "Rimborsata" quando il conto che doveva pagare ha restituito la somma.</p>
        </div>
      </div>
      <ul className="list">
        {owed.map((t) => (
          <li key={t.id} className="list-item wrap-mobile">
            <Icon name="wallet" />
            <div className="grow">
              <div className="title">{t.descrizione}</div>
              <div className="sub">
                {dateLabel(t.data)} {t.data.slice(0, 4)} · anticipata da {findAccount(data, t.pagatoDa)?.nome ?? 'un conto eliminato'}: da restituire
              </div>
            </div>
            <strong className="num">{formatEuro(t.importo)}</strong>
            <button type="button" className="btn small" onClick={() => setReimbursed(account.id, t.id, true)}>
              Rimborsata
            </button>
          </li>
        ))}
        {advanced.map(({ account: other, tx: t }) => (
          <li key={t.id} className="list-item wrap-mobile">
            <Icon name="wallet" />
            <div className="grow">
              <div className="title">{t.descrizione}</div>
              <div className="sub">
                {dateLabel(t.data)} {t.data.slice(0, 4)} · pagata per {other.nome}: da ricevere
              </div>
            </div>
            <strong className="num">{formatEuro(t.importo)}</strong>
            <button type="button" className="btn small" onClick={() => setReimbursed(other.id, t.id, true)}>
              Rimborsata
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
