import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getState } from './store/store';
import { registerOffline, requestPersistentStorage } from './ui/device';
import { applyStoredTheme } from './ui/theme';
import './styles.css';

applyStoredTheme();
registerOffline();

// Con dati veri chiede al browser di non cancellarli per liberare spazio.
const { settings } = getState();
if (settings.primoUtilizzo && !settings.datiDiEsempio) void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
