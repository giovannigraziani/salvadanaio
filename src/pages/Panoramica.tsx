import { projectGoal } from '../domain/goals';
import { formatEuro, percent } from '../domain/money';
import { currentMonth, daysInMonth, monthLabel } from '../domain/month';
import { categoryRows, summarizePlan, transactionsOfMonth } from '../domain/plan';
import { createMonthPlan, loadDemo, payPlanned, setTransferDone } from '../store/actions';
import { useData } from '../store/store';
import { CategoryDot, Meter, Money, Notice, Stat } from '../ui/components';
import { Icon } from '../ui/icons';
import { useOpenTransaction } from '../ui/quickAdd';

export function Panoramica() {
  const data = useData();
  const openTransaction = useOpenTransaction();
  const month = currentMonth();
  const plan = data.piani[month];
  const tx = transactionsOfMonth(data.movimenti, month);
  const isEmpty = Object.keys(data.piani).length === 0 && data.movimenti.length === 0;

  if (isEmpty) return <Welcome />;

  const summary = plan ? summarizePlan(plan, tx) : undefined;
  const rows = categoryRows(plan, tx, data.categorie);
  const atRisk = rows.filter((r) => r.budget > 0 && r.utilizzo >= 85).sort((a, b) => b.utilizzo - a.utilizzo);
  const noBudget = rows.filter((r) => r.budget === 0 && r.speso > 0);
  const daysLeft = daysInMonth(month) - new Date().getDate() + 1;
  const upcoming = (plan?.spesePreviste ?? []).filter((p) => !p.movimentoId).sort((a, b) => (a.giorno ?? 99) - (b.giorno ?? 99));
  const pendingTransfers = (plan?.trasferimenti ?? []).filter((t) => !t.eseguito && t.importo > 0);
  const goals = data.obiettivi.filter((g) => !g.archiviato).sort((a, b) => a.priorita - b.priorita);
  const saved = summary ? summary.trasferimenti : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{data.settings.nome ? `Ciao ${data.settings.nome}` : 'Panoramica'}</h1>
          <p>{monthLabel(month)}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => openTransaction()}>
          <Icon name="plus" /> Registra spesa
        </button>
      </div>

      {!plan && (
        <div className="card">
          <Notice kind="warn">
            Non hai ancora un piano per {monthLabel(month).toLowerCase()}.{' '}
            <button type="button" className="btn small" onClick={() => createMonthPlan(month)}>
              Crealo dal modello
            </button>
          </Notice>
        </div>
      )}

      {summary && (
        <div className="grid grid-2">
          <div className="card">
            <div className="muted small">Puoi ancora spendere questo mese</div>
            <div className={`hero-value ${summary.residuo < 0 ? 'text-bad' : ''}`}>{formatEuro(summary.residuo)}</div>
            <div className="small muted" style={{ margin: '4px 0 12px' }}>
              {summary.residuo > 0
                ? `circa ${formatEuro(Math.floor(summary.residuo / daysLeft))} al giorno per ${daysLeft} giorni`
                : 'Budget del mese esaurito'}
            </div>
            <Meter value={summary.speso} max={summary.budget} label="Budget utilizzato" />
            <div className="split small" style={{ marginTop: 8 }}>
              <span className="muted">Speso {formatEuro(summary.speso)}</span>
              <span className="muted">Budget {formatEuro(summary.budget)}</span>
            </div>
            {summary.previsteDaPagare > 0 && (
              <p className="small" style={{ marginBottom: 0 }}>
                Di questo residuo, <strong>{formatEuro(summary.previsteDaPagare)}</strong> sono già impegnati in spese previste.
              </p>
            )}
          </div>
          <div className="grid grid-2 keep">
            <Stat label="Entrate del mese" value={<Money value={summary.entrate} />} />
            <Stat label="Quote versate" value={<Money value={summary.trasferimentiEseguiti} />} hint={`su ${formatEuro(saved)} previste`} />
            <Stat label="Spese pianificate" value={<Money value={summary.spesoPianificato} />} hint={`${percent(summary.spesoPianificato, summary.speso)}% dello speso`} />
            <Stat label="Spese estemporanee" value={<Money value={summary.spesoEstemporaneo} />} hint={`${percent(summary.spesoEstemporaneo, summary.speso)}% dello speso`} />
          </div>
        </div>
      )}

      <div className="grid grid-2 section-gap">
        <div className="card">
          <div className="card-head">
            <h2>Da fare questo mese</h2>
            <a className="small" href={`#/piano/${month}`}>
              Apri il piano
            </a>
          </div>
          {pendingTransfers.length === 0 && upcoming.length === 0 ? (
            <p className="muted">Tutto in ordine: nessuna quota o spesa prevista in sospeso.</p>
          ) : (
            <ul className="list">
              {pendingTransfers.map((t) => (
                <li key={t.id} className="list-item wrap-mobile">
                  <Icon name="up" />
                  <div className="grow">
                    <div className="title">{t.descrizione}</div>
                    <div className="sub">Quota da versare</div>
                  </div>
                  <strong className="num">{formatEuro(t.importo)}</strong>
                  <button type="button" className="btn small" onClick={() => setTransferDone(month, t.id, true)}>
                    Versata
                  </button>
                </li>
              ))}
              {upcoming.slice(0, 6).map((p) => {
                const categoria = data.categorie.find((c) => c.id === p.categoriaId);
                return (
                  <li key={p.id} className="list-item wrap-mobile">
                    <CategoryDot color={categoria?.colore ?? 'var(--axis)'} />
                    <div className="grow">
                      <div className="title">{p.descrizione}</div>
                      <div className="sub">
                        {p.giorno ? `Giorno ${p.giorno} · ` : ''}
                        {categoria?.nome}
                      </div>
                    </div>
                    <strong className="num">{formatEuro(p.importo)}</strong>
                    <button type="button" className="btn small" onClick={() => payPlanned(month, p.id)}>
                      Pagata
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Categorie da tenere d'occhio</h2>
            <a className="small" href="#/analisi">
              Analisi
            </a>
          </div>
          {atRisk.length === 0 && noBudget.length === 0 ? (
            <p className="muted">Nessuna categoria vicina al limite del budget.</p>
          ) : (
            <ul className="list">
              {atRisk.map((r) => (
                <li key={r.categoria.id} className="list-item">
                  <CategoryDot color={r.categoria.colore} />
                  <div className="grow">
                    <div className="split">
                      <span className="title">{r.categoria.nome}</span>
                      <span className={`small ${r.residuo < 0 ? 'text-bad' : ''}`}>
                        {r.residuo < 0 ? `sforato di ${formatEuro(-r.residuo)}` : `restano ${formatEuro(r.residuo)}`}
                      </span>
                    </div>
                    <Meter value={r.speso} max={r.budget} label={`Budget ${r.categoria.nome}`} />
                  </div>
                </li>
              ))}
              {noBudget.map((r) => (
                <li key={r.categoria.id} className="list-item">
                  <CategoryDot color={r.categoria.colore} />
                  <div className="grow">
                    <div className="title">{r.categoria.nome}</div>
                    <div className="sub">Spesi {formatEuro(r.speso)} senza budget</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {goals.length > 0 && (
        <div className="card section-gap">
          <div className="card-head">
            <h2>Obiettivi</h2>
            <a className="small" href="#/obiettivi">
              Tutti gli obiettivi
            </a>
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

function Welcome() {
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h1>Benvenuto in Salvadanaio</h1>
      <p className="muted">Uno strumento per dare a ogni euro dello stipendio un compito, e poi verificare come è andata.</p>
      <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
        <li>
          <strong>Imposta il modello mensile</strong> in <a href="#/impostazioni">Impostazioni</a>: stipendio, quanto versi sul conto cointestato e sui
          risparmi, budget per categoria.
        </li>
        <li>
          <strong>Aggiungi le spese ricorrenti</strong> (abbonamenti, visite periodiche, assicurazioni): compariranno da sole nei mesi giusti.
        </li>
        <li>
          <strong>Crea il piano del mese</strong> e <strong>registra le spese</strong> con il pulsante "+ Spesa".
        </li>
        <li>
          <strong>Definisci gli obiettivi</strong> (auto, casa, investimenti) e controlla l'<strong>Analisi</strong> per ridistribuire i budget.
        </li>
      </ol>
      <div className="actions">
        <a className="btn primary" href="#/impostazioni">
          Inizia dal modello
        </a>
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
