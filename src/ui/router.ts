import { useSyncExternalStore } from 'react';

// Routing minimale basato sull'hash: "#/piano/2026-10" -> ["piano", "2026-10"].
// La rotta vive anche in memoria, così la navigazione funziona pure dove l'hash non è modificabile
// (es. quando l'app è incorporata in un iframe).

const listeners = new Set<() => void>();
let current = readHash();

function readHash() {
  try {
    return window.location.hash.replace(/^#\/?/, '');
  } catch {
    return '';
  }
}

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    current = readHash();
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRoute(): string[] {
  const path = useSyncExternalStore(subscribe, () => current, () => '');
  return path.split('/').filter(Boolean);
}

export function navigate(path: string) {
  current = path;
  emit();
  window.scrollTo?.(0, 0);
  try {
    if (readHash() !== path) history.pushState(null, '', `#/${path}`);
  } catch {
    /* l'URL non è modificabile: resta la rotta in memoria */
  }
}
