import { useState } from 'react';
import { isValidMonth } from './domain/month';
import type { JointTransaction } from './domain/types';
import { Analisi } from './pages/Analisi';
import { Impostazioni } from './pages/Impostazioni';
import { Movimenti } from './pages/Movimenti';
import { Obiettivi } from './pages/Obiettivi';
import { Panoramica } from './pages/Panoramica';
import { Piano } from './pages/Piano';
import { getSaveError, useData } from './store/store';
import { resetAll } from './store/actions';
import { ConfirmButton, Notice } from './ui/components';
import { Icon, type IconName } from './ui/icons';
import { QuickAddContext } from './ui/quickAdd';
import { navigate, useRoute } from './ui/router';
import { blankTransaction, TransactionModal, type EditingTransaction, type Scope } from './ui/TransactionForm';
import { Cointestato } from './pages/Cointestato';

const sections: { path: string; label: string; short: string; icon: IconName }[] = [
  { path: '', label: 'Panoramica', short: 'Home', icon: 'home' },
  { path: 'piano', label: 'Piano mensile', short: 'Piano', icon: 'plan' },
  { path: 'movimenti', label: 'Spese', short: 'Spese', icon: 'list' },
  { path: 'cointestato', label: 'Conto cointestato', short: 'Comune', icon: 'users' },
  { path: 'analisi', label: 'Analisi', short: 'Analisi', icon: 'chart' },
  { path: 'obiettivi', label: 'Obiettivi', short: 'Obiettivi', icon: 'target' },
  { path: 'impostazioni', label: 'Impostazioni', short: 'Altro', icon: 'settings' },
];

function NavLinks({ current, short }: { current: string; short?: boolean }) {
  return (
    <>
      {sections.map((s) => (
        <a
          key={s.path}
          href={`#/${s.path}`}
          className={`nav-link ${current === s.path ? 'active' : ''}`}
          aria-current={current === s.path ? 'page' : undefined}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            navigate(s.path);
          }}
        >
          <Icon name={s.icon} />
          {short ? s.short : s.label}
        </a>
      ))}
    </>
  );
}

export function App() {
  const data = useData();
  const [section = '', param, extra] = useRoute();
  const [editing, setEditing] = useState<EditingTransaction | null>(null);
  const openTransaction = (partial?: Partial<JointTransaction>, scope?: Scope) =>
    setEditing({ tx: blankTransaction(partial), scope: scope ?? (section === 'cointestato' ? 'comune' : 'personale') });
  const month = param && isValidMonth(param) ? param : undefined;
  const saveError = getSaveError();

  let page;
  switch (section) {
    case 'piano':
      page = <Piano month={month} />;
      break;
    case 'movimenti':
      page = <Movimenti month={month} />;
      break;
    case 'cointestato':
      page = <Cointestato tab={param} month={extra && isValidMonth(extra) ? extra : undefined} />;
      break;
    case 'analisi':
      page = <Analisi />;
      break;
    case 'obiettivi':
      page = <Obiettivi />;
      break;
    case 'impostazioni':
      page = <Impostazioni />;
      break;
    default:
      page = <Panoramica />;
  }

  return (
    <QuickAddContext.Provider value={openTransaction}>
      <div className="app">
        <nav className="sidebar" aria-label="Sezioni">
          <div className="brand">
            <img src="./favicon.svg" alt="" />
            Salvadanaio
          </div>
          <NavLinks current={section} />
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
        <nav className="bottom-nav" aria-label="Sezioni">
          <NavLinks current={section} short />
        </nav>
      </div>
      <button type="button" className="btn primary fab" onClick={() => openTransaction()}>
        <Icon name="plus" /> Spesa
      </button>
      <TransactionModal editing={editing} onClose={() => setEditing(null)} />
    </QuickAddContext.Provider>
  );
}
