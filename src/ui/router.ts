import { useSyncExternalStore } from 'react';

/** Routing minimale basato sull'hash: "#/piano/2026-10" -> ["piano", "2026-10"]. */
function getHash() {
  return window.location.hash.replace(/^#\/?/, '');
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  return hash.split('/').filter(Boolean);
}

export function navigate(path: string) {
  window.location.hash = `#/${path}`;
}
