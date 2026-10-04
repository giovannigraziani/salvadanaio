import { newId } from './id';
import { currentMonth } from './month';
import type { Account, AccountType, AppData, Category } from './types';

/** Colori categoriali (ordine fisso, validato per daltonismo) usati per le categorie. */
export const palette = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

const cat = (id: string, nome: string, tipo: Category['tipo'], i: number): Category => ({
  id,
  nome,
  tipo,
  colore: palette[i % palette.length]!,
});

/** Categorie per le spese di un conto personale (quelle comuni passano dal conto cointestato). */
export const defaultCategories: Category[] = [
  cat('abbonamenti', 'Abbonamenti', 'essenziale', 0),
  cat('salute', 'Salute', 'essenziale', 1),
  cat('trasporti', 'Trasporti e auto', 'essenziale', 2),
  cat('svago', 'Svago e uscite', 'discrezionale', 3),
  cat('abbigliamento', 'Abbigliamento', 'discrezionale', 4),
  cat('cura', 'Cura personale e sport', 'discrezionale', 5),
  cat('regali', 'Regali', 'discrezionale', 6),
  cat('altro', 'Altro', 'discrezionale', 7),
];

/** Categorie delle spese comuni, pagate dal conto cointestato. */
export const defaultJointCategories: Category[] = [
  cat('c-casa', 'Affitto o mutuo', 'essenziale', 0),
  cat('c-bollette', 'Bollette e utenze', 'essenziale', 1),
  cat('c-spesa', 'Spesa alimentare', 'essenziale', 2),
  cat('c-manutenzione', 'Casa e arredo', 'discrezionale', 3),
  cat('c-svago', 'Uscite insieme', 'discrezionale', 4),
  cat('c-viaggi', 'Viaggi e weekend', 'discrezionale', 5),
  cat('c-salute', 'Salute e farmacia', 'essenziale', 6),
  cat('c-altro', 'Altro comune', 'discrezionale', 7),
];

/** Categorie per le uscite da un conto di risparmio o investimento. */
export const defaultSavingsCategories: Category[] = [
  cat('r-prelievi', 'Prelievi', 'discrezionale', 0),
  cat('r-imprevisti', 'Imprevisti', 'essenziale', 1),
  cat('r-costi', 'Costi e commissioni', 'essenziale', 2),
];

export const accountTypeLabels: Record<AccountType, string> = {
  personale: 'Personale',
  cointestato: 'Cointestato',
  risparmio: 'Risparmi',
  investimenti: 'Investimenti',
};

function categoriesFor(tipo: AccountType): Category[] {
  if (tipo === 'cointestato') return defaultJointCategories.map((c) => ({ ...c }));
  if (tipo === 'personale') return defaultCategories.map((c) => ({ ...c }));
  return defaultSavingsCategories.map((c) => ({ ...c }));
}

/** Nuovo conto vuoto del tipo indicato. */
export function newAccount(tipo: AccountType, nome: string, patch: Partial<Account> = {}): Account {
  return {
    id: newId(),
    nome,
    tipo,
    giornoStipendio: tipo === 'personale' ? 27 : undefined,
    saldoIniziale: 0,
    meseSaldoIniziale: currentMonth(),
    categorie: categoriesFor(tipo),
    ricorrenze: [],
    modello: {
      entrate: tipo === 'personale' ? [{ descrizione: 'Stipendio', importo: 0 }] : [],
      trasferimenti: [],
      budget: {},
    },
    piani: {},
    movimenti: [],
    ripartizione: tipo === 'cointestato' ? { regola: 'paritaria', partecipanti: [], percentuali: {}, arrotondamento: 1000 } : undefined,
    ...patch,
  };
}

export const SCHEMA_VERSION = 3;

/** Punto di partenza: il mio conto, il conto cointestato e il conto risparmi. */
export function emptyData(): AppData {
  const mio = newAccount('personale', 'Il mio conto', { id: 'principale' });
  const cointestato = newAccount('cointestato', 'Conto cointestato', { id: 'cointestato' });
  const risparmi = newAccount('risparmio', 'Conto risparmi', { id: 'risparmio' });
  mio.modello.trasferimenti = [
    { descrizione: 'Versamento conto cointestato', importo: 0, contoId: cointestato.id },
    { descrizione: 'Versamento risparmi', importo: 0, contoId: risparmi.id },
  ];
  cointestato.ripartizione!.partecipanti = [mio.id];
  return { version: SCHEMA_VERSION, settings: {}, conti: [mio, cointestato, risparmi], obiettivi: [] };
}
