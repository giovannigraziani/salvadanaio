import { useSyncExternalStore } from 'react';
import { emptyData, SCHEMA_VERSION } from '../domain/defaults';
import { demoData } from '../domain/demo';
import { migrate } from '../domain/migrate';
import { currentMonth, today } from '../domain/month';
import type { AppData } from '../domain/types';

const STORAGE_KEY = 'salvadanaio:data';

function load(): AppData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const raw = JSON.parse(stored) as { version?: number };
      // Prima di convertire dati di una versione precedente ne conserva una copia intatta.
      if (typeof raw.version === 'number' && raw.version < SCHEMA_VERSION)
        localStorage.setItem(`${STORAGE_KEY}:v${raw.version}`, stored);
      return migrate(raw);
    }
  } catch (error) {
    console.error('Impossibile leggere i dati salvati', error);
  }
  // La versione di anteprima parte con i dati di esempio per mostrare subito l'app all'opera.
  if (import.meta.env.VITE_AVVIO_DEMO === '1') return demoData(currentMonth(), new Date().getDate());
  return emptyData();
}

let state: AppData = load();
let saveError: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveError = null;
  } catch {
    saveError = 'Non è stato possibile salvare i dati nel browser. Esporta un backup.';
  }
}

export function getState(): AppData {
  return state;
}

export function getSaveError(): string | null {
  return saveError;
}

/** Sostituisce l'intero stato (import, reset, dati demo). */
export function replaceState(next: AppData) {
  state = next;
  persist();
  emit();
}

/** Applica una modifica su una copia dello stato e salva. */
export function mutate(recipe: (draft: AppData) => void) {
  const draft = structuredClone(state);
  recipe(draft);
  draft.settings.primoUtilizzo ??= today();
  replaceState(draft);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Sincronizza più schede aperte sulla stessa app.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      state = migrate(JSON.parse(event.newValue));
      emit();
    } catch {
      /* ignora dati non validi scritti da altre schede */
    }
  });
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, getState, getState);
}
