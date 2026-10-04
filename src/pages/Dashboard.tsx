import { useState } from 'react';
import { accountTypeLabels } from '../domain/defaults';
import { goalSaved, projectGoal } from '../domain/goals';
import {
  accountsOf,
  activeAccounts,
  byDate,
  categoryRows,
  currentBalance,
  investmentSummary,
  myName,
  ownerName,
  participants,
  people,
  sharedWith,
  shares,
  summarizePlan,
  transactionsOfMonth,
} from '../domain/ledger';
import { formatEuro, sum } from '../domain/money';
import { currentMonth, dateLabel, dayNumber, monthLabel, today } from '../domain/month';
import type { Account, AppData, Goal } from '../domain/types';
import { createMonthPlan, loadDemo, payPlanned, setTransferDone } from '../store/actions';
import { useData } from '../store/store';
import { BackupReminder } from '../ui/BackupReminder';
import { CategoryDot, Link, Meter, Money, Segmented, Stat } from '../ui/components';
import { Icon } from '../ui/icons';
import { useOpenTransaction } from '../ui/quickAdd';
import { SalaryFlowCard } from '../ui/SalaryFlowCard';

const ALL = '__tutti__';
const PREF_KEY = 'salvadanaio:dashboard-persona';

function storedPerson(): string | null {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}

export function Dashboard() {
  const data = useData();
  const openTransaction = useOpenTransaction();
  const persons = people(data);
  const [chosen, setChosen] = useState<string>(() => storedPerson() ?? myName(data));
  const person = chosen === ALL || persons.includes(chosen) ? chosen : (persons[0] ?? ALL);
  const choose = (p: string) => {
    setChosen(p);
    try {
      localStorage.setItem(PREF_KEY, p);
    } catch {
      /* preferenza non salvata */
    }
  };

  const accounts = activeAccounts(data);
  const isEmpty = accounts.every((a) => Object.keys(a.piani).length === 0 && a.movimenti.length === 0);
  if (isEmpty) return <Welcome />;

  const greeting = data.settings.nome ? `Ciao ${data.settings.nome}` : 'Dashboard';
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting}</h1>
          <p>Dashboard · {monthLabel(currentMonth())}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => openTransaction()}>
          <Icon name="plus" /> Registra spesa
        </button>
      </div>

      <BackupReminder />

      {persons.length > 1 && (
        <div className="subnav">
          <span className="small muted">Conti di</span>
          <Segmented
            label="Di chi vedere i conti"
            value={person}
            onChange={choose}
            options={[...persons.map((p) => ({ value: p, label: p === myName(data) ? `${p} (tu)` : p })), { value: ALL, label: 'Tutti' }]}
          />
        </div>
      )}

      {person === ALL ? <EveryoneView data={data} persons={persons} /> : <PersonView data={data} person={person} />}
    </>
  );
}

// ---------- Vista di una persona ----------

function PersonView({ data, person }: { data: AppData; person: string }) {
  const month = currentMonth();
  const now = today();
  const own = accountsOf(data, person);
  const shared = sharedWith(data, person);
  const personal = own.filter((a) => a.tipo === 'personale');
  const ownIds = new Set(own.map((a) => a.id));
  // Parte delle spese comuni del mese che spetta alla persona.
  const sharedSpent = sum(shared, (j) => {
    const s = shares(data, j);
    const share = sum(own, (a) => s[a.id] ?? 0);
    return sum(transactionsOfMonth(j.movimenti, month), (t) => t.importo) * share;
  });
  const goals = data.obiettivi.filter((g) => !g.archiviato && g.contoId && ownIds.has(g.contoId));
  const isMe = person === myName(data);

  return (
    <>
      <div className="grid grid-4">
        <Stat label={isMe ? 'Saldo dei tuoi conti' : `Saldo dei conti di ${person}`} value={<Money value={sum(own, (a) => currentBalance(data, a, month, now))} />} hint={`${own.length} ${own.length === 1 ? 'conto' : 'conti'}, esclusi i condivisi`} />
        <Stat label="Entrate del mese" value={<Money value={sum(personal, (a) => sum(a.piani[month]?.entrate ?? [], (e) => e.importo))} />} hint="Stipendio ed entrate dei conti personali" />
        <Stat
          label="Speso questo mese"
          value={<Money value={sum(own, (a) => sum(transactionsOfMonth(a.movimenti, month), (t) => t.importo))} />}
          hint={sharedSpent > 0 ? `più ${formatEuro(Math.round(sharedSpent))} di spese comuni (la sua parte)` : 'Sui conti personali'}
        />
        <Stat label="Negli obiettivi" value={<Money value={sum(goals, goalSaved)} />} hint={`${goals.length} obiettivi sui suoi conti`} />
      </div>

      {personal.length > 0 && (
        <div className="section-gap">
          <SalaryFlowCard data={data} person={person} />
        </div>
      )}

      <div className="grid grid-2 section-gap">
        {[...own, ...shared].map((a) => (
          <AccountCard key={a.id} data={data} account={a} />
        ))}
      </div>

      <div className="grid grid-2 section-gap">
        <Todo accounts={[...own, ...shared]} />
        <Watchlist accounts={[...own, ...shared]} />
      </div>

      <GoalsCard goals={goals} />
    </>
  );
}

// ---------- Vista di tutti ----------

function EveryoneView({ data, persons }: { data: AppData; persons: string[] }) {
  const month = currentMonth();
  const now = today();
  const accounts = activeAccounts(data);
  const shared = accounts.filter((a) => a.tipo === 'cointestato');
  const goals = data.obiettivi.filter((g) => !g.archiviato);
  return (
    <>
      <div className="grid grid-4">
        <Stat label="Saldo di tutti i conti" value={<Money value={sum(accounts, (a) => currentBalance(data, a, month, now))} />} hint={`${accounts.length} conti di ${persons.length} persone`} />
        <Stat
          label="Entrate del mese"
          value={<Money value={sum(accounts.filter((a) => a.tipo === 'personale'), (a) => sum(a.piani[month]?.entrate ?? [], (e) => e.importo))} />}
          hint="Tutti gli stipendi"
        />
        <Stat label="Speso questo mese" value={<Money value={sum(accounts, (a) => sum(transactionsOfMonth(a.movimenti, month), (t) => t.importo))} />} hint="Tutti i conti" />
        <Stat label="Negli obiettivi" value={<Money value={sum(goals, goalSaved)} />} hint={`${goals.length} obiettivi`} />
      </div>

      {persons.map((p) => {
        const own = accountsOf(data, p);
        return (
          <section key={p} className="section-gap">
            <div className="split" style={{ margin: '8px 0' }}>
              <h2>{p}</h2>
              <span className="small muted">Saldo {formatEuro(sum(own, (a) => currentBalance(data, a, month, now)))}</span>
            </div>
            <div className="grid grid-2">
              {own.map((a) => (
                <AccountCard key={a.id} data={data} account={a} />
              ))}
            </div>
          </section>
        );
      })}
      {shared.length > 0 && (
        <section className="section-gap">
          <h2 style={{ margin: '8px 0' }}>Condivisi</h2>
          <div className="grid grid-2">
            {shared.map((a) => (
              <AccountCard key={a.id} data={data} account={a} />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-2 section-gap">
        <Todo accounts={accounts} />
        <Watchlist accounts={accounts} />
      </div>
      <GoalsCard goals={goals} />
    </>
  );
}

// ---------- Componenti comuni ----------

function AccountCard({ data, account }: { data: AppData; account: Account }) {
  const month = currentMonth();
  const plan = account.piani[month];
  const s = summarizePlan(data, account, month);
  const balance = currentBalance(data, account, month, today());
  const pendingOut = (plan?.trasferimenti ?? []).filter((t) => !t.eseguito && t.importo > 0).length;
  const pendingIn = s.inArrivo - s.inArrivoRicevuti;
  const toPay = (plan?.spesePreviste ?? []).filter((p) => !p.movimentoId && !p.aConsumo).length;
  const investment = account.tipo === 'investimenti' ? investmentSummary(data, account, month, today()) : undefined;
  const subtitle =
    account.tipo === 'cointestato'
      ? `Condiviso tra ${participants(data, account).map(ownerName).join(' e ') || 'nessuno'}`
      : `${accountTypeLabels[account.tipo]} · ${ownerName(account)}`;
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{account.nome}</h2>
          <p>{subtitle}</p>
        </div>
        <Link className="btn small" to={`conto/${account.id}/piano/${month}`}>
          Apri
        </Link>
      </div>
      <div className="split" style={{ marginBottom: 10 }}>
        <span className="muted small">{investment ? 'Versato (netto)' : 'Saldo stimato'}</span>
        <strong className={balance < 0 ? 'text-bad' : undefined}>{formatEuro(balance)}</strong>
      </div>
      {investment?.valore !== undefined && (
        <div className="split" style={{ margin: '-4px 0 10px' }}>
          <span className="muted small">Valore al {dateLabel(investment.data!)}</span>
          <span>
            <strong>{formatEuro(investment.valore)}</strong>{' '}
            <span className={`small ${investment.rendimento! < 0 ? 'text-bad' : 'text-good'}`}>
              {investment.rendimento! >= 0 ? '+' : ''}
              {formatEuro(investment.rendimento!)}
            </span>
          </span>
        </div>
      )}
      {!plan ? (
        <div className="actions">
          <span className="muted small">Nessun piano per questo mese.</span>
          <button type="button" className="btn small" onClick={() => createMonthPlan(account.id, month)}>
            Crea dal modello
          </button>
        </div>
      ) : (
        <>
          {s.budget > 0 && (
            <>
              <div className="split small">
                <span className="muted">Speso</span>
                <span>
                  {formatEuro(s.speso)} / {formatEuro(s.budget)}
                </span>
              </div>
              <div style={{ margin: '6px 0 10px' }}>
                <Meter value={s.speso} max={s.budget} label={`Budget ${account.nome}`} />
              </div>
            </>
          )}
          <div className="small">
            {pendingOut > 0 && <div>{pendingOut === 1 ? '1 quota da versare' : `${pendingOut} quote da versare`}</div>}
            {pendingIn > 0 && <div>{formatEuro(pendingIn)} in arrivo da altri conti</div>}
            {toPay > 0 && <div>{toPay === 1 ? '1 spesa prevista da pagare' : `${toPay} spese previste da pagare`}</div>}
            {s.daRimborsare > 0 && <div className="text-bad">{formatEuro(s.daRimborsare)} da rimborsare</div>}
            {pendingOut === 0 && pendingIn === 0 && toPay === 0 && s.daRimborsare === 0 && <div className="muted">Tutto in ordine questo mese.</div>}
          </div>
        </>
      )}
    </div>
  );
}

/** Quote da versare e spese previste dei prossimi giorni sui conti indicati. */
function Todo({ accounts }: { accounts: Account[] }) {
  const month = currentMonth();
  const horizon = dayNumber(today()) + 10;
  const transfers = accounts.flatMap((a) => (a.piani[month]?.trasferimenti ?? []).filter((t) => !t.eseguito && t.importo > 0).map((t) => ({ a, t })));
  const planned = accounts
    .flatMap((a) =>
      (a.piani[month]?.spesePreviste ?? []).filter((p) => !p.movimentoId && !p.aConsumo && (!p.data || dayNumber(p.data) <= horizon)).map((p) => ({ a, p })),
    )
    .sort((x, y) => byDate(x.p, y.p));
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Da fare</h2>
          <p>Quote del mese e spese previste nei prossimi 10 giorni.</p>
        </div>
      </div>
      {transfers.length === 0 && planned.length === 0 ? (
        <p className="muted">Tutto in ordine: nessuna quota o spesa prevista in sospeso.</p>
      ) : (
        <ul className="list">
          {transfers.map(({ a, t }) => (
            <li key={t.id} className="list-item wrap-mobile">
              <Icon name="up" />
              <div className="grow">
                <div className="title">{t.descrizione}</div>
                <div className="sub">Quota da versare · {a.nome}</div>
              </div>
              <strong className="num">{formatEuro(t.importo)}</strong>
              <button type="button" className="btn small" onClick={() => setTransferDone(a.id, month, t.id, true)}>
                Versata
              </button>
            </li>
          ))}
          {planned.slice(0, 8).map(({ a, p }) => {
            const categoria = a.categorie.find((c) => c.id === p.categoriaId);
            return (
              <li key={p.id} className="list-item wrap-mobile">
                <CategoryDot color={categoria?.colore ?? 'var(--axis)'} />
                <div className="grow">
                  <div className="title">{p.descrizione}</div>
                  <div className="sub">
                    {p.data ? `${dateLabel(p.data)} · ` : ''}
                    {a.nome}
                  </div>
                </div>
                <strong className="num">{formatEuro(p.importo)}</strong>
                <button type="button" className="btn small" onClick={() => payPlanned(a.id, month, p.id)}>
                  Pagata
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Categorie vicine o oltre il budget sui conti indicati. */
function Watchlist({ accounts }: { accounts: Account[] }) {
  const month = currentMonth();
  const rows = accounts.flatMap((a) =>
    categoryRows(a.piani[month], transactionsOfMonth(a.movimenti, month), a.categorie)
      .filter((r) => r.budget > 0 && r.utilizzo >= 85 && (r.residuo < 0 || r.previsto < r.budget))
      .map((r) => ({ a, r })),
  );
  rows.sort((x, y) => y.r.utilizzo - x.r.utilizzo);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Categorie da tenere d'occhio</h2>
      </div>
      {rows.length === 0 ? (
        <p className="muted">Nessuna categoria vicina al limite del budget.</p>
      ) : (
        <ul className="list">
          {rows.slice(0, 8).map(({ a, r }) => (
            <li key={`${a.id}-${r.categoria.id}`} className="list-item">
              <CategoryDot color={r.categoria.colore} />
              <div className="grow">
                <div className="split">
                  <span className="title">
                    {r.categoria.nome} <span className="muted small">· {a.nome}</span>
                  </span>
                  <span className={`small ${r.residuo < 0 ? 'text-bad' : ''}`}>
                    {r.residuo < 0 ? `sforato di ${formatEuro(-r.residuo)}` : `restano ${formatEuro(r.residuo)}`}
                  </span>
                </div>
                <Meter value={r.speso} max={r.budget} label={`Budget ${r.categoria.nome}`} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalsCard({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) return null;
  const month = currentMonth();
  return (
    <div className="card section-gap">
      <div className="card-head">
        <h2>Obiettivi</h2>
        <Link className="small" to="obiettivi">
          Tutti gli obiettivi
        </Link>
      </div>
      <div className="grid grid-2">
        {[...goals]
          .sort((a, b) => a.priorita - b.priorita)
          .slice(0, 6)
          .map((g) => {
            const p = projectGoal(g, month);
            return (
              <div key={g.id}>
                <div className="split">
                  <strong>{g.nome}</strong>
                  <span className="small muted">
                    {formatEuro(p.saved)} / {formatEuro(g.target)}
                  </span>
                </div>
                <div style={{ margin: '6px 0' }}>
                  <Meter value={Math.min(p.saved, g.target)} max={g.target} label={`Avanzamento ${g.nome}`} progress />
                </div>
                <div className="small muted">{p.progress}% raggiunto</div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function Welcome() {
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h1>Benvenuto in Salvadanaio</h1>
      <p className="muted">Uno strumento per dare a ogni euro dello stipendio un compito, e poi verificare come è andata, conto per conto.</p>
      <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
        <li>
          <strong>Sistema i conti</strong> in <Link to="impostazioni">Impostazioni</Link>: il tuo conto personale, il cointestato, i risparmi, gli investimenti.
          Puoi aggiungere anche il conto della tua compagna: ogni conto ha il suo titolare.
        </li>
        <li>
          Per ogni conto apri <strong>Piano → Modello</strong>: stipendio, quote verso gli altri conti, budget per categoria e spese ricorrenti (anche settimanali, a
          settimane alterne o "a consumo" come il carburante).
        </li>
        <li>
          Nel cointestato scegli <strong>come dividete le spese</strong>: in parti uguali, in proporzione agli stipendi o con percentuali fisse.
        </li>
        <li>
          Ogni mese <strong>crea il piano</strong>, registra le spese con "+ Spesa" e guarda nella dashboard <strong>dove va lo stipendio</strong>.
        </li>
      </ol>
      <div className="actions">
        <Link className="btn primary" to="impostazioni">
          Inizia dai conti
        </Link>
        <button type="button" className="btn" onClick={loadDemo}>
          Esplora con dati di esempio
        </button>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        I dati restano solo in questo browser. Puoi esportarli in qualsiasi momento dalle Impostazioni.
      </p>
    </div>
  );
}
