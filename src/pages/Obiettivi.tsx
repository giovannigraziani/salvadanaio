import { useState, type FormEvent } from 'react';
import { rangeStats } from '../domain/analysis';
import { emergencyFundTarget, goalTypeLabels, houseCashNeeded, mortgagePayment, projectGoal, type GoalStatus } from '../domain/goals';
import { newId } from '../domain/id';
import { formatEuro, sum } from '../domain/money';
import { currentMonth, dateLabel, monthLabel, today } from '../domain/month';
import type { AppData, Goal, GoalType } from '../domain/types';
import { addContribution, deleteContribution, deleteGoal, saveGoal } from '../store/actions';
import { useData } from '../store/store';
import { Field, IconButton, Meter, Modal, Money, MoneyInput, Stat } from '../ui/components';
import { Icon } from '../ui/icons';

const statusInfo: Record<GoalStatus, { label: string; tone: string }> = {
  raggiunto: { label: 'Raggiunto', tone: 'good' },
  'in-linea': { label: 'In linea', tone: 'good' },
  'in-ritardo': { label: 'In ritardo', tone: 'bad' },
  scaduto: { label: 'Scaduto', tone: 'bad' },
  'senza-scadenza': { label: 'Senza scadenza', tone: '' },
};

const priorityLabels = { 1: 'Alta', 2: 'Media', 3: 'Bassa' } as const;

function blankGoal(): Goal {
  return { id: newId(), nome: '', tipo: 'acquisto', target: 0, saldoIniziale: 0, versamenti: [], priorita: 2 };
}

export function Obiettivi() {
  const data = useData();
  const now = currentMonth();
  const [editing, setEditing] = useState<Goal | null>(null);
  const [contributing, setContributing] = useState<Goal | null>(null);
  const goals = data.obiettivi.filter((g) => !g.archiviato).sort((a, b) => a.priorita - b.priorita);
  const archived = data.obiettivi.filter((g) => g.archiviato);
  const projections = goals.map((g) => projectGoal(g, now));
  const totalSaved = sum(projections, (p) => p.saved);
  const totalRequired = sum(projections, (p) => p.requiredMonthly ?? 0);
  const totalPace = sum(projections.filter((p) => p.status !== 'raggiunto'), (p) => p.pace);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Obiettivi</h1>
          <p>Auto nuova, casa, investimenti, fondo emergenza: quanto manca e quanto versare.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setEditing(blankGoal())}>
          <Icon name="plus" /> Nuovo obiettivo
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="card empty">
          <h2>Nessun obiettivo</h2>
          <p>Crea il primo obiettivo e collegalo a una quota del piano mensile: ogni volta che segni la quota come versata, l'obiettivo avanza.</p>
          <button type="button" className="btn primary" onClick={() => setEditing(blankGoal())}>
            Crea obiettivo
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-3">
            <Stat label="Accantonato in totale" value={<Money value={totalSaved} />} />
            <Stat label="Versi ogni mese" value={<Money value={totalPace} />} hint="Contributi previsti o media degli ultimi 6 mesi" />
            <Stat
              label="Servirebbero ogni mese"
              value={<Money value={totalRequired} className={totalRequired > totalPace ? 'text-bad' : undefined} />}
              hint="Per rispettare tutte le scadenze"
            />
          </div>
          <div className="grid grid-2 section-gap">
            {goals.map((g, i) => (
              <GoalCard key={g.id} goal={g} projection={projections[i]!} data={data} onEdit={() => setEditing(g)} onContribute={() => setContributing(g)} />
            ))}
          </div>
        </>
      )}

      {archived.length > 0 && (
        <div className="card section-gap">
          <h2 style={{ marginBottom: 8 }}>Archiviati</h2>
          <ul className="list">
            {archived.map((g) => (
              <li key={g.id} className="list-item">
                <div className="grow">
                  <div className="title">{g.nome}</div>
                  <div className="sub">
                    {formatEuro(projectGoal(g, now).saved)} di {formatEuro(g.target)}
                  </div>
                </div>
                <button type="button" className="btn small" onClick={() => saveGoal({ ...g, archiviato: false })}>
                  Ripristina
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing && data.obiettivi.some((g) => g.id === editing.id) ? 'Modifica obiettivo' : 'Nuovo obiettivo'}>
        {editing && <GoalForm data={data} initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!contributing} onClose={() => setContributing(null)} title={`Versamento su ${contributing?.nome ?? ''}`}>
        {contributing && <ContributionForm goal={contributing} onDone={() => setContributing(null)} />}
      </Modal>
    </>
  );
}

function GoalCard({
  goal,
  projection: p,
  data,
  onEdit,
  onContribute,
}: {
  goal: Goal;
  projection: ReturnType<typeof projectGoal>;
  data: AppData;
  onEdit: () => void;
  onContribute: () => void;
}) {
  const status = statusInfo[p.status];
  const conto = data.conti.find((c) => c.id === goal.contoId);
  const linked = data.modello.trasferimenti.some((t) => t.obiettivoId === goal.id);
  return (
    <div className="card goal-card">
      <div className="top">
        <div>
          <h2>{goal.nome}</h2>
          <div className="small muted">
            {goalTypeLabels[goal.tipo]} · priorità {priorityLabels[goal.priorita].toLowerCase()}
            {conto ? ` · ${conto.nome}` : ''}
          </div>
        </div>
        <span className={`badge ${status.tone}`}>
          {p.status === 'raggiunto' || p.status === 'in-linea' ? <Icon name="check" /> : p.status !== 'senza-scadenza' ? <Icon name="alert" /> : null}
          {status.label}
        </span>
      </div>
      <div className="amounts">
        <strong>{formatEuro(p.saved)}</strong>
        <span className="muted">di {formatEuro(goal.target)}</span>
      </div>
      <Meter value={Math.min(p.saved, goal.target)} max={goal.target} label={`Avanzamento ${goal.nome}`} progress />
      <div className="small" style={{ marginTop: 10 }}>
        <div className="split">
          <span className="muted">Mancano</span>
          <strong>{formatEuro(p.remaining)}</strong>
        </div>
        {goal.scadenza && (
          <div className="split">
            <span className="muted">Scadenza</span>
            <span>
              {monthLabel(goal.scadenza)}
              {p.monthsLeft !== undefined && p.monthsLeft > 0 && ` (${p.monthsLeft} mesi)`}
            </span>
          </div>
        )}
        {p.requiredMonthly !== undefined && (
          <div className="split">
            <span className="muted">Servono al mese</span>
            <strong className={p.pace < p.requiredMonthly ? 'text-bad' : undefined}>{formatEuro(p.requiredMonthly)}</strong>
          </div>
        )}
        {p.status !== 'raggiunto' && (
          <div className="split">
            <span className="muted">{goal.contributoMensile ? 'Contributo previsto' : 'Media versamenti'}</span>
            <span>{formatEuro(p.pace)} / mese</span>
          </div>
        )}
        {p.status !== 'raggiunto' && (
          <div className="split">
            <span className="muted">A questo ritmo</span>
            <span>{p.eta ? monthLabel(p.eta) : 'non raggiungibile senza versamenti'}</span>
          </div>
        )}
      </div>
      {!linked && p.status !== 'raggiunto' && (
        <p className="small muted" style={{ marginBottom: 0 }}>
          Suggerimento: aggiungi una quota verso questo obiettivo nel modello mensile per farlo avanzare in automatico.
        </p>
      )}
      <div className="actions" style={{ marginTop: 14 }}>
        <button type="button" className="btn small primary" onClick={onContribute}>
          <Icon name="plus" /> Versamento
        </button>
        <button type="button" className="btn small" onClick={onEdit}>
          <Icon name="edit" /> Modifica
        </button>
      </div>
    </div>
  );
}

function ContributionForm({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const [importo, setImporto] = useState(goal.contributoMensile ?? 0);
  const [data, setData] = useState(today());
  const [nota, setNota] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!importo) return;
    addContribution(goal.id, { importo, data, nota: nota || undefined });
    onDone();
  };
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Importo (€)" hint="Usa un importo negativo per un prelievo">
          <MoneyInput value={importo} onChange={setImporto} autoFocus />
        </Field>
        <Field label="Data">
          <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="Nota" full>
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} />
        </Field>
      </div>
      <div className="modal-foot">
        <span />
        <div className="actions">
          <button type="button" className="btn" onClick={onDone}>
            Annulla
          </button>
          <button type="submit" className="btn primary">
            Registra
          </button>
        </div>
      </div>
    </form>
  );
}

function GoalForm({ data, initial, onDone }: { data: AppData; initial: Goal; onDone: () => void }) {
  const [g, setG] = useState(initial);
  const live = data.obiettivi.find((x) => x.id === g.id);
  const exists = !!live;
  const set = (patch: Partial<Goal>) => setG((x) => ({ ...x, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!g.nome.trim() || g.target <= 0) return;
    // I versamenti si gestiscono a parte: si parte sempre da quelli salvati.
    saveGoal({ ...g, nome: g.nome.trim(), versamenti: live?.versamenti ?? [] });
    onDone();
  };
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Nome" full>
          <input className="input" required autoFocus={!exists} value={g.nome} placeholder="Es. Auto nuova" onChange={(e) => set({ nome: e.target.value })} />
        </Field>
        <Field label="Tipo">
          <select className="input" value={g.tipo} onChange={(e) => set({ tipo: e.target.value as GoalType })}>
            {Object.entries(goalTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priorità">
          <select className="input" value={g.priorita} onChange={(e) => set({ priorita: Number(e.target.value) as Goal['priorita'] })}>
            <option value={1}>Alta</option>
            <option value={2}>Media</option>
            <option value={3}>Bassa</option>
          </select>
        </Field>

        {g.tipo === 'casa' && <HouseHelper onTarget={(target) => set({ target })} />}
        {g.tipo === 'emergenza' && <EmergencyHelper data={data} onTarget={(target) => set({ target })} />}

        <Field label="Importo obiettivo (€)">
          <MoneyInput value={g.target} onChange={(target) => set({ target })} />
        </Field>
        <Field label="Entro il" hint="Facoltativo">
          <input className="input" type="month" value={g.scadenza ?? ''} onChange={(e) => set({ scadenza: e.target.value || undefined })} />
        </Field>
        <Field label="Già accantonato (€)" hint="Saldo prima di iniziare a tracciare">
          <MoneyInput value={g.saldoIniziale} onChange={(saldoIniziale) => set({ saldoIniziale })} />
        </Field>
        <Field label="Contributo mensile previsto (€)" hint="Vuoto = media dei versamenti">
          <MoneyInput value={g.contributoMensile ?? 0} onChange={(v) => set({ contributoMensile: v || undefined })} />
        </Field>
        <Field label="Dove sono i soldi" full>
          <select className="input" value={g.contoId ?? ''} onChange={(e) => set({ contoId: e.target.value || undefined })}>
            <option value="">—</option>
            {data.conti.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note" full>
          <input className="input" value={g.note ?? ''} onChange={(e) => set({ note: e.target.value || undefined })} />
        </Field>
      </div>

      {live && live.versamenti.length > 0 && (
        <div className="section-gap">
          <h3>Versamenti</h3>
          <ul className="list">
            {[...live.versamenti]
              .sort((a, b) => b.data.localeCompare(a.data))
              .slice(0, 12)
              .map((v) => (
                <li key={v.id} className="list-item">
                  <div className="grow">
                    <div className="title">{formatEuro(v.importo)}</div>
                    <div className="sub">
                      {dateLabel(v.data)} {v.data.slice(0, 4)}
                      {v.nota ? ` · ${v.nota}` : ''}
                    </div>
                  </div>
                  <IconButton
                    icon="trash"
                    label="Elimina versamento"
                    onClick={() => deleteContribution(g.id, v.id)}
                  />
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="modal-foot">
        <div className="actions">
          {exists && (
            <>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  if (confirm(`Eliminare "${g.nome}" e tutti i suoi versamenti?`)) {
                    deleteGoal(g.id);
                    onDone();
                  }
                }}
              >
                Elimina
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  saveGoal({ ...g, versamenti: live?.versamenti ?? [], archiviato: true });
                  onDone();
                }}
              >
                Archivia
              </button>
            </>
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

/** Calcolo guidato per l'anticipo della prima casa. */
function HouseHelper({ onTarget }: { onTarget: (v: number) => void }) {
  const [prezzo, setPrezzo] = useState(25000000);
  const [anticipo, setAnticipo] = useState(20);
  const [accessori, setAccessori] = useState(5);
  const [tasso, setTasso] = useState(3);
  const [anni, setAnni] = useState(25);
  const cash = houseCashNeeded(prezzo, anticipo, accessori);
  const rata = mortgagePayment(prezzo - Math.round(prezzo * (anticipo / 100)), tasso, anni);
  return (
    <div className="full card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
      <h3 style={{ marginBottom: 10 }}>Calcolo anticipo e rata</h3>
      <div className="form-grid">
        <Field label="Prezzo casa (€)">
          <MoneyInput value={prezzo} onChange={setPrezzo} />
        </Field>
        <Field label="Anticipo (%)" hint="Le banche finanziano di solito fino all'80%">
          <input className="input" type="number" min={0} max={100} value={anticipo} onChange={(e) => setAnticipo(Number(e.target.value))} />
        </Field>
        <Field label="Costi accessori (%)" hint="Notaio, imposte, agenzia, perizia">
          <input className="input" type="number" min={0} max={30} step={0.5} value={accessori} onChange={(e) => setAccessori(Number(e.target.value))} />
        </Field>
        <Field label="Tasso mutuo (%) · durata (anni)">
          <div className="actions" style={{ flexWrap: 'nowrap' }}>
            <input className="input" type="number" min={0} step={0.1} value={tasso} onChange={(e) => setTasso(Number(e.target.value))} aria-label="Tasso" />
            <input className="input" type="number" min={1} max={40} value={anni} onChange={(e) => setAnni(Number(e.target.value))} aria-label="Durata" />
          </div>
        </Field>
      </div>
      <p className="small" style={{ marginBottom: 8 }}>
        Liquidità necessaria: <strong>{formatEuro(cash)}</strong> · rata stimata del mutuo: <strong>{formatEuro(rata)}</strong> al mese
      </p>
      <button type="button" className="btn small" onClick={() => onTarget(cash)}>
        Usa come obiettivo
      </button>
    </div>
  );
}

/** Fondo emergenza: N mesi di spese, stimate dalle spese personali e dal versamento al cointestato. */
function EmergencyHelper({ data, onTarget }: { data: AppData; onTarget: (v: number) => void }) {
  const [mesi, setMesi] = useState(6);
  const stats = rangeStats(data, currentMonth(), 6);
  const monthly = stats.length ? Math.round(sum(stats, (s) => s.speso + s.trasferimenti.cointestato) / stats.length) : 0;
  const target = emergencyFundTarget(monthly, mesi);
  return (
    <div className="full card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
      <h3 style={{ marginBottom: 10 }}>Calcolo fondo emergenza</h3>
      <p className="small muted">
        Costo mensile stimato: {formatEuro(monthly)} (spese personali + quota per il conto cointestato, media ultimi 6 mesi).
      </p>
      <Field label="Mesi da coprire" hint="Di solito tra 3 e 6">
        <input className="input" type="number" min={1} max={24} value={mesi} onChange={(e) => setMesi(Number(e.target.value))} />
      </Field>
      <p className="small">
        Obiettivo suggerito: <strong>{formatEuro(target)}</strong>
      </p>
      <button type="button" className="btn small" disabled={!target} onClick={() => onTarget(target)}>
        Usa come obiettivo
      </button>
    </div>
  );
}
