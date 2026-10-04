import { useSyncExternalStore } from 'react';
import { emptyData, SCHEMA_VERSION } from '../domain/defaults';
import { demoData } from '../domain/demo';
import { currentMonth } from '../domain/month';
import type { AppData } from '../domain/types';

const STORAGE_KEY = 'salvadanaio:data';

/** Porta dati salvati con versioni precedenti allo schema attuale. */
export function migrate(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('Formato dati non valido');
  const data = raw as Partial<AppData>;
  if (typeof data.version !== 'number' || data.version > SCHEMA_VERSION)
    throw new Error('Versione dei dati non supportata');
  const base = emptyData();
  // Versione 1: schema iniziale. Le migrazioni future andranno aggiunte qui in sequenza.
  return {
    ...base,
    ...data,
    settings: { ...base.settings, ...data.settings },
    modello: { ...base.modello, ...data.modello },
    version: SCHEMA_VERSION,
  } as AppData;
}

function load(): AppData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return migrate(JSON.parse(stored));
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
