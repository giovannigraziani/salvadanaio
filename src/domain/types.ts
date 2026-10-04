// Modello dati di Salvadanaio.
// Tutti gli importi sono in centesimi (interi) per evitare errori di arrotondamento.

export type ID = string;
/** Mese nel formato "YYYY-MM". */
export type MonthKey = string;
/** Data nel formato "YYYY-MM-DD". */
export type DateKey = string;
/** Importo in centesimi di euro. */
export type Cents = number;

export type AccountType = 'cointestato' | 'risparmio' | 'investimenti' | 'personale';

/** Un conto su cui viene versata una parte dello stipendio. */
export interface Account {
  id: ID;
  nome: string;
  tipo: AccountType;
  note?: string;
}

/** Essenziale = spesa difficilmente comprimibile; discrezionale = spesa su cui si può agire. */
export type CategoryKind = 'essenziale' | 'discrezionale';

export interface Category {
  id: ID;
  nome: string;
  tipo: CategoryKind;
  colore: string;
  archiviata?: boolean;
}

/** Ogni quanti mesi si ripete una spesa ricorrente. */
export type Frequency = 1 | 2 | 3 | 4 | 6 | 12;

/** Impegno ricorrente (abbonamenti, rate, visite periodiche...). */
export interface Recurring {
  id: ID;
  descrizione: string;
  categoriaId: ID;
  importo: Cents;
  frequenza: Frequency;
  /** Primo mese in cui la spesa si presenta. */
  meseInizio: MonthKey;
  /** Ultimo mese incluso (facoltativo). */
  meseFine?: MonthKey;
  /** Giorno del mese previsto per l'addebito. */
  giorno?: number;
  attiva: boolean;
}

export interface IncomeLine {
  id: ID;
  descrizione: string;
  importo: Cents;
}

/** Quota dello stipendio spostata altrove: un conto o un obiettivo. */
export interface TransferLine {
  id: ID;
  descrizione: string;
  importo: Cents;
  contoId?: ID;
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
  giorno?: number;
  /** Se generata da una ricorrenza. */
  ricorrenzaId?: ID;
  /** Movimento reale che ha "pagato" questa spesa prevista. */
  movimentoId?: ID;
}

/** La "teoria" di un mese: entrate, ripartizione, budget e spese previste. */
export interface MonthPlan {
  mese: MonthKey;
  entrate: IncomeLine[];
  trasferimenti: TransferLine[];
  /** Budget di spesa personale per categoria. */
  budget: Record<ID, Cents>;
  spesePreviste: PlannedExpense[];
  note?: string;
}

/** Modello da cui si genera ogni nuovo piano mensile. */
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
  nome?: string;
  /** Giorno del mese in cui arriva lo stipendio. */
  giornoStipendio: number;
  /** true se i dati sono quelli di esempio. */
  datiDiEsempio?: boolean;
}

export interface AppData {
  version: number;
  settings: Settings;
  conti: Account[];
  categorie: Category[];
  ricorrenze: Recurring[];
  modello: PlanTemplate;
  piani: Record<MonthKey, MonthPlan>;
  movimenti: Transaction[];
  obiettivi: Goal[];
  cointestato: JointData;
}

// ---------- Conto cointestato ----------

/** Chi partecipa al conto cointestato. */
export type Partner = 'io' | 'partner';

/** Come si dividono le spese comuni. */
export type SplitRule = 'paritaria' | 'proporzionale' | 'percentuale';

export interface JointSettings {
  /** Conto (di tipo cointestato) su cui arrivano i versamenti. */
  contoId?: ID;
  nomePartner: string;
  regola: SplitRule;
  /** Redditi netti mensili, usati dalla regola proporzionale. */
  redditoIo: Cents;
  redditoPartner: Cents;
  /** Quota a mio carico (0-100), usata dalla regola percentuale. */
  percentualeIo: number;
  /** Le quote vengono arrotondate per eccesso a multipli di questo importo. */
  arrotondamento: Cents;
  /** Saldo del conto all'inizio di `meseSaldoIniziale`. */
  saldoIniziale: Cents;
  meseSaldoIniziale: MonthKey;
}

/** Chi ha pagato una spesa comune: il conto stesso o una persona che l'ha anticipata. */
export type Payer = 'conto' | Partner;

export interface JointTransaction extends Transaction {
  pagatoDa: Payer;
  /** Per le spese anticipate: true quando il conto ha restituito la somma. */
  rimborsato?: boolean;
}

/** Piano mensile del conto cointestato. */
export interface JointPlan {
  mese: MonthKey;
  budget: Record<ID, Cents>;
  spesePreviste: PlannedExpense[];
  /** Versamento della persona partner (il mio è la quota "cointestato" del mio piano personale). */
  versamentoPartner: { importo: Cents; eseguito: boolean };
  note?: string;
}

export interface JointData {
  impostazioni: JointSettings;
  categorie: Category[];
  ricorrenze: Recurring[];
  /** Budget per categoria usato per i nuovi piani mensili. */
  modelloBudget: Record<ID, Cents>;
  piani: Record<MonthKey, JointPlan>;
  movimenti: JointTransaction[];
}
