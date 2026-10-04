import { accountTypeLabels } from '../domain/defaults';
import { currentBalance, findAccount } from '../domain/ledger';
import { formatEuro } from '../domain/money';
import { currentMonth, today } from '../domain/month';
import type { ID, MonthKey } from '../domain/types';
import { useData } from '../store/store';
import { Link, MonthSwitcher, Segmented } from '../ui/components';
import { useOpenTransaction } from '../ui/quickAdd';
import { navigate } from '../ui/router';
import { TransactionsBrowser } from '../ui/TransactionsBrowser';
import { AnalisiView } from './conto/AnalisiView';
import { MeseView } from './conto/MeseView';
import { ModelloView } from './conto/ModelloView';

type Tab = 'piano' | 'spese' | 'analisi';
/** Le sottoschede nell'URL: "modello" è la scheda Piano con l'interruttore su Modello. */
export type AccountView = Tab | 'modello';

const views: AccountView[] = ['piano', 'modello', 'spese', 'analisi'];

export function isAccountView(v: string | undefined): v is AccountView {
  return !!v && (views as string[]).includes(v);
}

export function Conto({ id, view = 'piano', month = currentMonth() }: { id: ID; view?: AccountView; month?: MonthKey }) {
  const data = useData();
  const openTransaction = useOpenTransaction();
  const account = findAccount(data, id);
  if (!account)
    return (
      <div className="card empty">
        <h2>Conto non trovato</h2>
        <p>Potrebbe essere stato eliminato.</p>
        <Link className="btn" to="">
          Torna alla panoramica
        </Link>
      </div>
    );

  const tab: Tab = view === 'modello' ? 'piano' : view;
  const go = (v: AccountView, m: MonthKey = month) => navigate(`conto/${account.id}/${v}/${m}`);
  const saldo = currentBalance(data, account, month, today());

  return (
    <>
      <div className="page-head">
        <div>
          <div className="account-head">
            <h1>{account.nome}</h1>
            <span className="badge">{accountTypeLabels[account.tipo]}</span>
            {account.archiviato && <span className="badge">archiviato</span>}
          </div>
          <p>
            Saldo stimato <strong className={saldo < 0 ? 'text-bad' : undefined}>{formatEuro(saldo)}</strong>
            {account.titolare && account.tipo === 'personale' ? ` · ${account.titolare}` : ''}
          </p>
        </div>
        {view !== 'modello' && <MonthSwitcher month={month} onChange={(m) => go(view, m)} />}
      </div>

      <div className="subnav">
        <Segmented<Tab>
          label="Sezione del conto"
          value={tab}
          onChange={(t) => go(t)}
          options={[
            { value: 'piano', label: 'Piano' },
            { value: 'spese', label: 'Spese' },
            { value: 'analisi', label: 'Analisi' },
          ]}
        />
        {tab === 'piano' && (
          <Segmented<'piano' | 'modello'>
            label="Vista del piano"
            value={view === 'modello' ? 'modello' : 'piano'}
            onChange={(v) => go(v)}
            options={[
              { value: 'piano', label: 'Mese' },
              { value: 'modello', label: 'Modello' },
            ]}
          />
        )}
      </div>

      {view === 'piano' && <MeseView data={data} account={account} month={month} />}
      {view === 'modello' && <ModelloView data={data} account={account} />}
      {view === 'spese' && (
        <TransactionsBrowser
          transactions={account.movimenti}
          categorie={account.categorie}
          month={month}
          onOpen={(t) => openTransaction(t, account.id)}
          onAdd={(partial) => openTransaction(partial, account.id)}
          badge={(t) => {
            if (!t.pagatoDa) return null;
            const by = findAccount(data, t.pagatoDa)?.nome ?? 'altro conto';
            return t.rimborsato ? <span className="badge">rimborsata a {by}</span> : <span className="badge bad">anticipata da {by}</span>;
          }}
        />
      )}
      {view === 'analisi' && <AnalisiView data={data} account={account} end={month} />}
    </>
  );
}
