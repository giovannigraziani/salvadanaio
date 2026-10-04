// Funzioni legate al browser: funzionamento offline e protezione dell'archivio locale.

/** Registra il service worker che rende l'app disponibile anche senza connessione. */
export function registerOffline() {
  if (!import.meta.env.PROD || import.meta.env.VITE_AVVIO_DEMO === '1') return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Modalità offline non disponibile', error));
  });
}

export type StorageStatus = 'protetto' | 'non-protetto' | 'non-supportato';

/** Chiede al browser di non cancellare i dati dell'app per liberare spazio. */
export async function requestPersistentStorage(): Promise<StorageStatus> {
  try {
    if (!navigator.storage?.persist) return 'non-supportato';
    if (await navigator.storage.persisted()) return 'protetto';
    return (await navigator.storage.persist()) ? 'protetto' : 'non-protetto';
  } catch {
    return 'non-supportato';
  }
}

export async function storageStatus(): Promise<StorageStatus> {
  try {
    if (!navigator.storage?.persisted) return 'non-supportato';
    return (await navigator.storage.persisted()) ? 'protetto' : 'non-protetto';
  } catch {
    return 'non-supportato';
  }
}

/** true se l'app è aperta come app installata (dalla schermata Home). */
export function isInstalled(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
