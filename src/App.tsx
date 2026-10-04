import { useState } from 'react';
import { accountTypeLabels } from './domain/defaults';
import { activeAccounts, primaryAccount } from './domain/ledger';
import { isValidMonth } from './domain/month';
import type { Account, AppData, ID, Transaction } from './domain/types';
import { Conto, isAccountView } from './pages/Conto';
import { Impostazioni } from './pages/Impostazioni';
import { Obiettivi } from './pages/Obiettivi';
import { Dashboard } from './pages/Dashboard';
import { resetAll } from './store/actions';
import { getSaveError, useData } from './store/store';
import { ConfirmButton, Notice } from './ui/components';
import { Icon, type IconName } from './ui/icons';
import { QuickAddContext } from './ui/quickAdd';
import { navigate, useRoute } from './ui/router';
import { blankTransaction, TransactionModal, type EditingTransaction } from './ui/TransactionForm';

interface NavItem {
  path: string;
  /** Prima parte del percorso che rende attiva la voce. */
  match: string;
  label: string;
  short: string;
  icon: IconName;
}

const accountIcons: Record<Account['tipo'], IconName> = {
  personale: 'user',
  cointestato: 'users',
  risparmio: 'piggy',
  investimenti: 'trend',
};

function navItems(data: AppData): NavItem[] {
  return [
    { path: '', match: '', label: 'Dashboard', short: 'Home', icon: 'home' },
    ...activeAccounts(data).map((a) => ({
      path: `conto/${a.id}`,
      match: `conto/${a.id}`,
      label: a.nome,
      short: a.tipo === 'personale' ? (a.titolare ?? a.nome) : a.tipo === 'cointestato' ? 'Comune' : a.tipo === 'investimenti' ? 'Investim.' : accountTypeLabels[a.tipo],
      icon: accountIcons[a.tipo],
    })),
    { path: 'obiettivi', match: 'obiettivi', label: 'Obiettivi', short: 'Obiettivi', icon: 'target' },
    { path: 'impostazioni', match: 'impostazioni', label: 'Impostazioni', short: 'Altro', icon: 'settings' },
  ];
}

function NavLinks({ items, current, short }: { items: NavItem[]; current: string; short?: boolean }) {
  return (
    <>
      {items.map((s) => (
        <a
          key={s.path}
          href={`#/${s.path}`}
          className={`nav-link ${current === s.match ? 'active' : ''}`}
          aria-current={current === s.match ? 'page' : undefined}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            navigate(s.path);
          }}
        >
          <Icon name={s.icon} />
          <span className="nav-label">{short ? s.short : s.label}</span>
        </a>
      ))}
    </>
  );
}

/** Indirizzi delle versioni precedenti (#/piano, #/movimenti, #/cointestato…) portati alle schede dei conti. */
function legacyRedirect(data: AppData, section: string, param?: string): string | undefined {
  const primary = primaryAccount(data);
  const joint = activeAccounts(data).find((a) => a.tipo === 'cointestato');
  const month = param && isValidMonth(param) ? `/${param}` : '';
  if (section === 'piano' && primary) return `conto/${primary.id}/piano${month}`;
  if (section === 'movimenti' && primary) return `conto/${primary.id}/spese${month}`;
  if (section === 'analisi' && primary) return `conto/${primary.id}/analisi`;
  if (section === 'cointestato' && joint) return `conto/${joint.id}/piano`;
  return undefined;
}

export function App() {
  const data = useData();
  const [section = '', param, view, extra] = useRoute();
  const [editing, setEditing] = useState<EditingTransaction | null>(null);
  const currentAccount: ID | undefined = section === 'conto' ? param : undefined;
  const openTransaction = (partial?: Partial<Transaction>, accountId?: ID) =>
    setEditing({ tx: blankTransaction(partial), accountId: accountId ?? currentAccount ?? primaryAccount(data)?.id });
  const saveError = getSaveError();
  const items = navItems(data);

  const redirect = legacyRedirect(data, section, param);
  if (redirect) queueMicrotask(() => navigate(redirect));

  let page;
  if (section === 'conto' && param)
    page = <Conto id={param} view={isAccountView(view) ? view : undefined} month={extra && isValidMonth(extra) ? extra : undefined} />;
  else if (section === 'obiettivi') page = <Obiettivi />;
  else if (section === 'impostazioni') page = <Impostazioni />;
  else page = <Dashboard />;
  const current = section === 'conto' ? `conto/${param}` : section;

  return (
    <QuickAddContext.Provider value={openTransaction}>
      <div className="app">
        <nav className="sidebar" aria-label="Sezioni">
          <div className="brand">
            <img src="./favicon.svg" alt="" />
            Salvadanaio
          </div>
          <NavLinks items={items} current={current} />
        </nav>
        <main className="main">
          {saveError && <Notice kind="bad">{saveError}</Notice>}
          {data.settings.datiDiEsempio && (
            <div className="demo-banner">
              <Notice>
                Stai guardando <strong>dati di esempio</strong>: prova pure a modificarli.{' '}
                <ConfirmButton className="btn small" question="Cancellare i dati di esempio?" confirmLabel="Inizia da zero" onConfirm={resetAll}>
                  Inizia con i tuoi dati
                </ConfirmButton>
              </Notice>
            </div>
          )}
          {page}
        </main>
        <nav className="bottom-nav" aria-label="Sezioni" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(44px, 1fr))` }}>
          <NavLinks items={items} current={current} short />
        </nav>
      </div>
      <button type="button" className="btn primary fab" onClick={() => openTransaction()}>
        <Icon name="plus" /> Spesa
      </button>
      <TransactionModal editing={editing} onClose={() => setEditing(null)} />
    </QuickAddContext.Provider>
  );
}
