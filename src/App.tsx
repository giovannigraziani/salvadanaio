import { useState } from 'react';
import { isValidMonth } from './domain/month';
import type { Transaction } from './domain/types';
import { Analisi } from './pages/Analisi';
import { Impostazioni } from './pages/Impostazioni';
import { Movimenti } from './pages/Movimenti';
import { Obiettivi } from './pages/Obiettivi';
import { Panoramica } from './pages/Panoramica';
import { Piano } from './pages/Piano';
import { getSaveError, useData } from './store/store';
import { Notice } from './ui/components';
import { Icon, type IconName } from './ui/icons';
import { QuickAddContext } from './ui/quickAdd';
import { useRoute } from './ui/router';
import { blankTransaction, TransactionModal } from './ui/TransactionForm';

const sections: { path: string; label: string; short: string; icon: IconName }[] = [
  { path: '', label: 'Panoramica', short: 'Home', icon: 'home' },
  { path: 'piano', label: 'Piano mensile', short: 'Piano', icon: 'plan' },
  { path: 'movimenti', label: 'Spese', short: 'Spese', icon: 'list' },
  { path: 'analisi', label: 'Analisi', short: 'Analisi', icon: 'chart' },
  { path: 'obiettivi', label: 'Obiettivi', short: 'Obiettivi', icon: 'target' },
  { path: 'impostazioni', label: 'Impostazioni', short: 'Altro', icon: 'settings' },
];

function NavLinks({ current, short }: { current: string; short?: boolean }) {
  return (
    <>
      {sections.map((s) => (
        <a key={s.path} href={`#/${s.path}`} className={`nav-link ${current === s.path ? 'active' : ''}`} aria-current={current === s.path ? 'page' : undefined}>
          <Icon name={s.icon} />
          {short ? s.short : s.label}
        </a>
      ))}
    </>
  );
}

export function App() {
  useData(); // ri-renderizza a ogni modifica dei dati
  const [section = '', param] = useRoute();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const openTransaction = (partial?: Partial<Transaction>) => setEditing(blankTransaction(partial));
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
          {page}
        </main>
        <nav className="bottom-nav" aria-label="Sezioni">
          <NavLinks current={section} short />
        </nav>
      </div>
      <button type="button" className="btn primary fab" onClick={() => openTransaction()}>
        <Icon name="plus" /> Spesa
      </button>
      <TransactionModal tx={editing} onClose={() => setEditing(null)} />
    </QuickAddContext.Provider>
  );
}
