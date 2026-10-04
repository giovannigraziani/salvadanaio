import type { AppData, Category } from './types';

/** Colori categoriali (ordine fisso, validato per daltonismo) usati per le categorie. */
export const palette = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

const cat = (id: string, nome: string, tipo: Category['tipo'], i: number): Category => ({
  id,
  nome,
  tipo,
  colore: palette[i % palette.length]!,
});

/** Categorie per le spese personali (quelle comuni passano dal conto cointestato). */
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

export const SCHEMA_VERSION = 1;

export function emptyData(): AppData {
  return {
    version: SCHEMA_VERSION,
    settings: { giornoStipendio: 27 },
    conti: [
      { id: 'cointestato', nome: 'Conto cointestato', tipo: 'cointestato', note: 'Spese comuni di casa' },
      { id: 'risparmio', nome: 'Conto risparmi', tipo: 'risparmio' },
    ],
    categorie: defaultCategories,
    ricorrenze: [],
    modello: {
      entrate: [{ descrizione: 'Stipendio', importo: 0 }],
      trasferimenti: [
        { descrizione: 'Versamento conto cointestato', importo: 0, contoId: 'cointestato' },
        { descrizione: 'Versamento risparmi', importo: 0, contoId: 'risparmio' },
      ],
      budget: {},
    },
    piani: {},
    movimenti: [],
    obiettivi: [],
  };
}
