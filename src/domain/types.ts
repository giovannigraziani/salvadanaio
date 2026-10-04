// Modello dati di Salvadanaio.
// Tutti gli importi sono in centesimi (interi) per evitare errori di arrotondamento.

export type ID = string;
/** Mese nel formato "YYYY-MM". */
export type MonthKey = string;
/** Data nel formato "YYYY-MM-DD". */
export type DateKey = string;
/** Importo in centesimi di euro. */
export type Cents = number;

export type AccountType = 'personale' | 'cointestato' | 'risparmio' | 'investimenti';

/** Essenziale = spesa difficilmente comprimibile; discrezionale = spesa su cui si può agire. */
export type CategoryKind = 'essenziale' | 'discrezionale';

export interface Category {
  id: ID;
  nome: string;
  tipo: CategoryKind;
  colore: string;
  archiviata?: boolean;
}

/**
 * Ogni quanto si ripete una spesa ricorrente.
 * - mesi: ogni N mesi, nello stesso giorno del mese della prima data;
 * - settimane: ogni N settimane, nello stesso giorno della settimana della prima data.
 */
export interface Schedule {
  tipo: 'mesi' | 'settimane';
  ogni: number;
}

/** Impegno ricorrente (abbonamenti, rate, visite periodiche...). */
export interface Recurring {
  id: ID;
  descrizione: string;
  categoriaId: ID;
  importo: Cents;
  ripetizione: Schedule;
  /** Data della prima occorrenza: fissa il giorno del mese o della settimana. */
  inizio: DateKey;
  /** Ultima data possibile (facoltativa). */
  fine?: DateKey;
  attiva: boolean;
  /**
   * Spesa "a consumo": nel piano diventa una voce senza data (es. carburante, spesa settimanale)
   * che più spese durante il mese vanno a riempire. L'importo del mese è importo × occorrenze.
   */
  aConsumo?: boolean;
}

export interface IncomeLine {
  id: ID;
  descrizione: string;
  importo: Cents;
}

/** Quota spostata dal conto verso un altro conto o un obiettivo. */
export interface TransferLine {
  id: ID;
  descrizione: string;
  importo: Cents;
  /** Conto di destinazione. */
  contoId?: ID;
  /** Obiettivo di destinazione (i soldi vanno sul conto dell'obiettivo). */
  obiettivoId?: ID;
  /** true quando il versamento è stato effettivamente fatto. */
  eseguito: boolean;
  /** Versamento generato sull'obiettivo quando la quota è segnata come eseguita. */
  versamentoId?: ID;
}

/** Spesa prevista per uno specifico mese. */
export interface PlannedExpense {
  id: ID;
  descrizione: string;
  categoriaId: ID;
  importo: Cents;
  /** Data prevista (facoltativa). */
  data?: DateKey;
  /** Se generata da una ricorrenza. */
  ricorrenzaId?: ID;
  /** Movimento reale che ha "pagato" questa spesa prevista (solo spese singole). */
  movimentoId?: ID;
  /** Voce a consumo: senza data, la riempiono tutte le spese collegate (tramite `previstaId`). */
  aConsumo?: boolean;
}

/** La "teoria" di un mese per un conto: entrate, quote da versare, budget e spese previste. */
export interface MonthPlan {
  mese: MonthKey;
  entrate: IncomeLine[];
  trasferimenti: TransferLine[];
  /** Budget di spesa per categoria. */
  budget: Record<ID, Cents>;
  spesePreviste: PlannedExpense[];
  note?: string;
}

/** Modello da cui si genera ogni nuovo piano mensile del conto. */
export interface PlanTemplate {
  entrate: Omit<IncomeLine, 'id'>[];
  trasferimenti: Omit<TransferLine, 'id' | 'eseguito' | 'versamentoId'>[];
  budget: Record<ID, Cents>;
}

/** Spesa effettivamente sostenuta. */
export interface Transaction {
  id: ID;
  data: DateKey;
  descrizione: string;
  categoriaId: ID;
  importo: Cents;
  /** Collegamento a una spesa prevista: se assente la spesa è estemporanea. */
  previstaId?: ID;
  note?: string;
  /** Conto che ha anticipato la spesa al posto di questo (es. una spesa comune pagata con il proprio conto). */
  pagatoDa?: ID;
  /** Per le spese anticipate: true quando questo conto ha restituito la somma. */
  rimborsato?: boolean;
}

/** Come si dividono le spese di un conto condiviso. */
export type SplitRule = 'paritaria' | 'proporzionale' | 'percentuale';

export interface JointSplit {
  regola: SplitRule;
  /** Conti che alimentano il conto condiviso. */
  partecipanti: ID[];
  /** Quote in percentuale per la regola "percentuale". */
  percentuali: Record<ID, number>;
  /** Le quote vengono arrotondate per eccesso a multipli di questo importo. */
  arrotondamento: Cents;
}

/** Valore di mercato di un conto investimenti in una certa data. */
export interface Valuation {
  id: ID;
  data: DateKey;
  valore: Cents;
}

/** Un conto con il suo piano, le sue spese e il suo saldo. */
export interface Account {
  id: ID;
  nome: string;
  tipo: AccountType;
  /** Persona a cui appartiene il conto (tutti i conti tranne quelli cointestati). */
  titolare?: string;
  /** Giorno in cui arriva lo stipendio: data dei versamenti e del saldo. */
  giornoStipendio?: number;
  /** Saldo del conto all'inizio di `meseSaldoIniziale`. */
  saldoIniziale: Cents;
  meseSaldoIniziale: MonthKey;
  categorie: Category[];
  ricorrenze: Recurring[];
  modello: PlanTemplate;
  piani: Record<MonthKey, MonthPlan>;
  movimenti: Transaction[];
  /** Regola di ripartizione (conti cointestati). */
  ripartizione?: JointSplit;
  /** Valore di mercato registrato nel tempo (conti investimenti). */
  valutazioni?: Valuation[];
  note?: string;
  archiviato?: boolean;
}

export type GoalType = 'acquisto' | 'casa' | 'investimento' | 'emergenza' | 'altro';

export interface GoalContribution {
  id: ID;
  data: DateKey;
  importo: Cents;
  nota?: string;
}

export interface Goal {
  id: ID;
  nome: string;
  tipo: GoalType;
  /** Importo da raggiungere. */
  target: Cents;
  /** Mese entro cui raggiungerlo (facoltativo). */
  scadenza?: MonthKey;
  /** Quanto si pensa di versare ogni mese. */
  contributoMensile?: Cents;
  /** Somma già disponibile prima di iniziare a tracciare i versamenti. */
  saldoIniziale: Cents;
  versamenti: GoalContribution[];
  contoId?: ID;
  priorita: 1 | 2 | 3;
  note?: string;
  archiviato?: boolean;
}

export interface Settings {
  /** Il mio nome, usato nel saluto. */
  nome?: string;
  /** true se i dati sono quelli di esempio. */
  datiDiEsempio?: boolean;
  /** Data dell'ultimo backup esportato o copiato. */
  ultimoBackup?: DateKey;
  /** Data del primo salvataggio, per il promemoria del backup. */
  primoUtilizzo?: DateKey;
}

export interface AppData {
  version: number;
  settings: Settings;
  /** Il primo conto non archiviato è quello predefinito. */
  conti: Account[];
  obiettivi: Goal[];
}
