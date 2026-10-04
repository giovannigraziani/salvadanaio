import { accountTypeLabels } from '../domain/defaults';
import { goalSaved, projectGoal } from '../domain/goals';
import { activeAccounts, byDate, categoryRows, currentBalance, summarizePlan, transactionsOfMonth } from '../domain/ledger';
import { formatEuro, sum } from '../domain/money';
import { currentMonth, dateLabel, dayNumber, monthLabel, today } from '../domain/month';
import type { Account, AppData } from '../domain/types';
import { createMonthPlan, loadDemo, payPlanned, setTransferDone } from '../store/actions';
import { useData } from '../store/store';
import { BackupReminder } from '../ui/BackupReminder';
import { CategoryDot, Link, Meter, Money, Stat } from '../ui/components';
import { Icon } from '../ui/icons';
import { useOpenTransaction } from '../ui/quickAdd';

export function Panoramica() {
  const data = useData();
  const openTransaction = useOpenTransaction();
  const month = currentMonth();
  const accounts = activeAccounts(data);
  const isEmpty = accounts.every((a) => Object.keys(a.piani).length === 0 && a.movimenti.length === 0);
  if (isEmpty) return <Welcome />;

  const now = today();
  const balances = accounts.map((a) => currentBalance(data, a, month, now));
  const personal = accounts.filter((a) => a.tipo === 'personale');
  const entrate = sum(personal, (a) => sum(a.piani[month]?.entrate ?? [], (e) => e.importo));
  const speso = sum(accounts, (a) => sum(transactionsOfMonth(a.movimenti, month), (t) => t.importo));
  const goals = data.obiettivi.filter((g) => !g.archiviato).sort((a, b) => a.priorita - b.priorita);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{data.settings.nome ? `Ciao ${data.settings.nome}` : 'Panoramica'}</h1>
          <p>{monthLabel(month)} · tutti i conti</p>
        </div>
        <button type="button" className="btn primary" onClick={() => openTransaction()}>
          <Icon name="plus" /> Registra spesa
        </button>
      </div>

      <BackupReminder />

      <div className="grid grid-4">
        <Stat label="Saldo totale stimato" value={<Money value={sum(balances, (b) => b)} />} hint={`su ${accounts.length} conti`} />
        <Stat label="Entrate del mese" value={<Money value={entrate} />} hint="Stipendi ed entrate dei conti personali" />
        <Stat label="Speso questo mese" value={<Money value={speso} />} hint="Tutti i conti" />
        <Stat label="Negli obiettivi" value={<Money value={sum(goals, goalSaved)} />} hint={`${goals.length} obiettivi attivi`} />
      </div>

      <div className="grid grid-2 section-gap">
        {accounts.map((a, i) => (
          <AccountCard key={a.id} data={data} account={a} balance={balances[i]!} />
        ))}
      </div>

      <div className="grid grid-2 section-gap">
        <Todo data={data} />
        <Watchlist data={data} />
      </div>

      {goals.length > 0 && (
        <div className="card section-gap">
          <div className="card-head">
            <h2>Obiettivi</h2>
            <Link className="small" to="obiettivi">
              Tutti gli obiettivi
            </Link>
          </div>
          <div className="grid grid-2">
            {goals.slice(0, 4).map((g) => {
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
      )}
    </>
  );
}

function AccountCard({ data, account, balance }: { data: AppData; account: Account; balance: number }) {
  const month = currentMonth();
  const plan = account.piani[month];
  const s = summarizePlan(data, account, month);
  const pendingOut = (plan?.trasferimenti ?? []).filter((t) => !t.eseguito && t.importo > 0).length;
  const pendingIn = s.inArrivo - s.inArrivoRicevuti;
  const toPay = (plan?.spesePreviste ?? []).filter((p) => !p.movimentoId).length;
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="account-head">
            <h2>{account.nome}</h2>
            <span className="badge">{accountTypeLabels[account.tipo]}</span>
          </div>
          <p>
            Saldo stimato <strong className={balance < 0 ? 'text-bad' : undefined}>{formatEuro(balance)}</strong>
          </p>
        </div>
        <Link className="btn small" to={`conto/${account.id}/piano/${month}`}>
          Apri
        </Link>
      </div>
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

/** Quote da versare e spese previste dei prossimi giorni, su tutti i conti. */
function Todo({ data }: { data: AppData }) {
  const month = currentMonth();
  const horizon = dayNumber(today()) + 10;
  const transfers = activeAccounts(data).flatMap((a) => (a.piani[month]?.trasferimenti ?? []).filter((t) => !t.eseguito && t.importo > 0).map((t) => ({ a, t })));
  const planned = activeAccounts(data)
    .flatMap((a) => (a.piani[month]?.spesePreviste ?? []).filter((p) => !p.movimentoId && (!p.data || dayNumber(p.data) <= horizon)).map((p) => ({ a, p })))
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

/** Categorie vicine o oltre il budget, su tutti i conti. */
function Watchlist({ data }: { data: AppData }) {
  const month = currentMonth();
  const rows = activeAccounts(data).flatMap((a) =>
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

function Welcome() {
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h1>Benvenuto in Salvadanaio</h1>
      <p className="muted">Uno strumento per dare a ogni euro dello stipendio un compito, e poi verificare come è andata, conto per conto.</p>
      <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
        <li>
          <strong>Sistema i conti</strong> in <Link to="impostazioni">Impostazioni</Link>: il tuo conto personale, il cointestato, i risparmi. Puoi aggiungere anche
          il conto della tua compagna.
        </li>
        <li>
          Per ogni conto apri <strong>Piano → Modello</strong>: stipendio, quote verso gli altri conti, budget per categoria e spese ricorrenti (anche settimanali o a
          settimane alterne).
        </li>
        <li>
          Nel cointestato scegli <strong>come dividete le spese</strong>: in parti uguali, in proporzione agli stipendi o con percentuali fisse.
        </li>
        <li>
          Ogni mese <strong>crea il piano</strong>, registra le spese con "+ Spesa" e guarda l'<strong>Analisi</strong> di ogni conto.
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
