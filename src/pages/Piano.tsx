import { useState, type FormEvent } from 'react';
import { newId } from '../domain/id';
import { formatEuro, percent } from '../domain/money';
import { addMonths, currentMonth, monthLabel } from '../domain/month';
import { categoryRows, missingRecurring, summarizePlan, transactionsOfMonth, transferBreakdown } from '../domain/plan';
import type { AppData, Cents, MonthKey, MonthPlan, PlannedExpense } from '../domain/types';
import {
  copyPlanFrom,
  createMonthPlan,
  deletePlan,
  payPlanned,
  removePlanned,
  removeTransfer,
  saveAsTemplate,
  setTransferDone,
  syncRecurring,
  unpayPlanned,
  updatePlan,
} from '../store/actions';
import { useData } from '../store/store';
import { FlowBar } from '../ui/charts';
import { CategoryDot, Field, IconButton, Meter, Modal, Money, MoneyInput, MonthSwitcher, Notice, Stat } from '../ui/components';
import { IncomeEditor, TransferEditor } from '../ui/editors';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';

export function Piano({ month = currentMonth() }: { month?: MonthKey }) {
  const data = useData();
  const plan = data.piani[month];
  const go = (m: MonthKey) => navigate(`piano/${m}`);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Piano mensile</h1>
          <p>La teoria del mese: come ripartire lo stipendio e quali spese aspettarsi.</p>
        </div>
        <MonthSwitcher month={month} onChange={go} />
      </div>
      {plan ? <PlanView data={data} plan={plan} /> : <NoPlan data={data} month={month} />}
    </>
  );
}

function NoPlan({ data, month }: { data: AppData; month: MonthKey }) {
  const previous = data.piani[addMonths(month, -1)];
  const templateIncome = data.modello.entrate.reduce((a, e) => a + e.importo, 0);
  return (
    <div className="card empty">
      <h2>Nessun piano per {monthLabel(month)}</h2>
      <p>
        Il piano nasce dal tuo modello mensile e include automaticamente le spese ricorrenti del mese.
        {templateIncome === 0 && ' Suggerimento: imposta prima il modello nelle Impostazioni.'}
      </p>
      <div className="actions" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn primary" onClick={() => createMonthPlan(month)}>
          <Icon name="plus" /> Crea dal modello
        </button>
        {previous && (
          <button type="button" className="btn" onClick={() => copyPlanFrom(month, addMonths(month, -1))}>
            <Icon name="copy" /> Copia da {monthLabel(addMonths(month, -1))}
          </button>
        )}
        <a className="btn" href="#/impostazioni">
          Modifica modello
        </a>
      </div>
    </div>
  );
}

function PlanView({ data, plan }: { data: AppData; plan: MonthPlan }) {
  const month = plan.mese;
  const tx = transactionsOfMonth(data.movimenti, month);
  const summary = summarizePlan(plan, tx);
  const rows = categoryRows(plan, tx, data.categorie);
  const missing = missingRecurring(plan, data.ricorrenze);
  const breakdown = transferBreakdown(plan.trasferimenti, data.conti);
  const [editingPlanned, setEditingPlanned] = useState<PlannedExpense | null>(null);
  const update = (recipe: (p: MonthPlan) => void) => updatePlan(month, recipe);
  const underBudget = rows.filter((r) => r.previsto > r.budget);

  const flow = [
    { key: 'cointestato', label: 'Cointestato', value: breakdown.cointestato, color: '#2a78d6' },
    { key: 'risparmio', label: 'Risparmi', value: breakdown.risparmio, color: '#eb6834' },
    { key: 'obiettivi', label: 'Obiettivi e investimenti', value: breakdown.obiettivi + breakdown.investimenti, color: '#1baf7a' },
    { key: 'altro', label: 'Altri trasferimenti', value: breakdown.altro, color: '#e87ba4' },
    { key: 'budget', label: 'Spese personali', value: summary.budget, color: '#eda100' },
    { key: 'libero', label: 'Non allocato', value: Math.max(0, summary.nonAllocato), color: 'var(--axis)' },
  ];

  return (
    <div className="stack">
      <div className="grid grid-4">
        <Stat label="Entrate" value={<Money value={summary.entrate} />} />
        <Stat label="Ripartizione" value={<Money value={summary.trasferimenti} />} hint={`${percent(summary.trasferimenti, summary.entrate)}% delle entrate`} />
        <Stat label="Budget spese" value={<Money value={summary.budget} />} hint={`di cui previste ${formatEuro(summary.previste)}`} />
        <Stat
          label="Non allocato"
          value={<Money value={summary.nonAllocato} className={summary.nonAllocato < 0 ? 'text-bad' : undefined} />}
          hint={summary.nonAllocato < 0 ? 'Il piano supera le entrate' : 'Margine libero'}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Come si divide lo stipendio</h2>
            <p>Ripartizione teorica delle entrate di {monthLabel(month).toLowerCase()}.</p>
          </div>
          <div className="actions">
            <button type="button" className="btn small" onClick={() => confirm('Usare questo piano come modello per i prossimi mesi?') && saveAsTemplate(month)}>
              Salva come modello
            </button>
            <button type="button" className="btn small danger" onClick={() => confirm(`Eliminare il piano di ${monthLabel(month)}? Le spese registrate restano.`) && deletePlan(month)}>
              Elimina piano
            </button>
          </div>
        </div>
        <FlowBar segments={flow} total={summary.entrate} />
        {summary.nonAllocato < 0 && (
          <div className="section-gap">
            <Notice kind="bad">
              Hai pianificato <strong>{formatEuro(-summary.nonAllocato)}</strong> in più di quanto entra. Riduci il budget o le quote da versare.
            </Notice>
          </div>
        )}
      </div>

      <div className="grid grid-1-2">
        <div className="card">
          <div className="card-head">
            <h2>Entrate</h2>
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
            onAdd={() => update((p) => p.entrate.push({ id: newId(), descrizione: 'Entrata extra', importo: 0 }))}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Quote da versare</h2>
              <p>
                Versate {formatEuro(summary.trasferimentiEseguiti)} su {formatEuro(summary.trasferimenti)}. Spunta quando hai fatto il bonifico.
              </p>
            </div>
          </div>
          <TransferEditor
            lines={plan.trasferimenti}
            conti={data.conti}
            obiettivi={data.obiettivi}
            onChange={(i, patch) => {
              const line = plan.trasferimenti[i]!;
              if (patch === null) return removeTransfer(month, line.id);
              update((p) => Object.assign(p.trasferimenti[i]!, patch));
              // Se cambia importo o destinazione di una quota già versata, riallinea il versamento sull'obiettivo.
              if (line.eseguito && (patch.importo !== undefined || 'obiettivoId' in patch)) setTransferDone(month, line.id, true);
            }}
            onAdd={() => update((p) => p.trasferimenti.push({ id: newId(), descrizione: 'Nuova quota', importo: 0, eseguito: false }))}
            onToggleDone={(i, done) => setTransferDone(month, plan.trasferimenti[i]!.id, done)}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Budget delle spese personali</h2>
            <p>Quanto pensi di spendere per categoria. Speso: {formatEuro(summary.speso)} su {formatEuro(summary.budget)}.</p>
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
            <h2>Spese previste</h2>
            <p>
              Impegni già noti del mese: pagate {formatEuro(summary.previstePagate)}, da pagare {formatEuro(summary.previsteDaPagare)}.
            </p>
          </div>
          <div className="actions">
            {missing.length > 0 && (
              <button type="button" className="btn small" onClick={() => syncRecurring(month)}>
                <Icon name="repeat" /> Aggiungi {missing.length} ricorrenz{missing.length === 1 ? 'a' : 'e'} mancant{missing.length === 1 ? 'e' : 'i'}
              </button>
            )}
            <button
              type="button"
              className="btn small primary"
              onClick={() => setEditingPlanned({ id: newId(), descrizione: '', categoriaId: data.categorie[0]?.id ?? '', importo: 0 })}
            >
              <Icon name="plus" /> Spesa prevista
            </button>
          </div>
        </div>
        {plan.spesePreviste.length === 0 ? (
          <p className="muted">Nessuna spesa prevista. Aggiungi visite mediche, rate, regali o configura le spese ricorrenti nelle Impostazioni.</p>
        ) : (
          <ul className="list">
            {[...plan.spesePreviste]
              .sort((a, b) => (a.giorno ?? 99) - (b.giorno ?? 99))
              .map((p) => {
                const categoria = data.categorie.find((c) => c.id === p.categoriaId);
                const paid = p.movimentoId ? data.movimenti.find((t) => t.id === p.movimentoId) : undefined;
                return (
                  <li key={p.id} className="list-item wrap-mobile">
                    <CategoryDot color={categoria?.colore ?? 'var(--axis)'} />
                    <div className="grow">
                      <div className="title">
                        {p.descrizione} {p.ricorrenzaId && <span className="badge" title="Da spesa ricorrente">ricorrente</span>}
                      </div>
                      <div className="sub">
                        {categoria?.nome ?? 'Senza categoria'}
                        {p.giorno ? ` · giorno ${p.giorno}` : ''}
                        {paid && paid.importo !== p.importo && ` · pagata ${formatEuro(paid.importo)}`}
                      </div>
                    </div>
                    <strong className="num">{formatEuro(p.importo)}</strong>
                    {paid ? (
                      <button type="button" className="btn small" onClick={() => unpayPlanned(month, p.id)} title="Annulla pagamento">
                        <span className="text-good">
                          <Icon name="check" />
                        </span>
                        Pagata
                      </button>
                    ) : (
                      <button type="button" className="btn small primary" onClick={() => payPlanned(month, p.id)}>
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

      <div className="card">
        <Field label="Note del mese">
          <textarea className="input" rows={2} value={plan.note ?? ''} placeholder="Es. mese con matrimonio di Luca, bollo auto..." onChange={(e) => update((p) => void (p.note = e.target.value || undefined))} />
        </Field>
      </div>

      <PlannedModal month={month} data={data} planned={editingPlanned} onClose={() => setEditingPlanned(null)} />
    </div>
  );
}

function PlannedModal({ month, data, planned, onClose }: { month: MonthKey; data: AppData; planned: PlannedExpense | null; onClose: () => void }) {
  return (
    <Modal open={!!planned} onClose={onClose} title={planned?.descrizione ? 'Modifica spesa prevista' : 'Nuova spesa prevista'}>
      {planned && <PlannedForm month={month} data={data} initial={planned} onDone={onClose} />}
    </Modal>
  );
}

function PlannedForm({ month, data, initial, onDone }: { month: MonthKey; data: AppData; initial: PlannedExpense; onDone: () => void }) {
  const [p, setP] = useState(initial);
  const exists = data.piani[month]?.spesePreviste.some((x) => x.id === p.id);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!p.descrizione.trim() || p.importo <= 0) return;
    updatePlan(month, (plan) => {
      const i = plan.spesePreviste.findIndex((x) => x.id === p.id);
      if (i >= 0) plan.spesePreviste[i] = p;
      else plan.spesePreviste.push(p);
    });
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
            {data.categorie
              .filter((c) => !c.archiviata || c.id === p.categoriaId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {p.ricorrenzaId && (
        <p className="small muted">Modifichi solo questo mese. Per cambiare tutti i mesi modifica la spesa ricorrente nelle Impostazioni.</p>
      )}
      <div className="modal-foot">
        <div>
          {exists && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                removePlanned(month, p.id);
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
