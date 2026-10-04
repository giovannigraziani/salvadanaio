import { newId } from './id';
import { sum } from './money';
import { monthOfDate } from './month';
import { occursIn } from './recurring';
import type {
  Account,
  AppData,
  Category,
  Cents,
  ID,
  MonthKey,
  MonthPlan,
  PlannedExpense,
  Recurring,
  Transaction,
  TransferLine,
} from './types';

export function plannedFromRecurring(r: Recurring): PlannedExpense {
  return {
    id: newId(),
    descrizione: r.descrizione,
    categoriaId: r.categoriaId,
    importo: r.importo,
    giorno: r.giorno,
    ricorrenzaId: r.id,
  };
}

/** Crea il piano di un mese partendo dal modello e dalle ricorrenze attive. */
export function createPlan(data: AppData, month: MonthKey): MonthPlan {
  const { modello } = data;
  return {
    mese: month,
    entrate: modello.entrate.map((e) => ({ ...e, id: newId() })),
    trasferimenti: modello.trasferimenti.map((t) => ({ ...t, id: newId(), eseguito: false })),
    budget: { ...modello.budget },
    spesePreviste: data.ricorrenze.filter((r) => occursIn(r, month)).map(plannedFromRecurring),
  };
}

/** Aggiunge al piano le ricorrenze del mese non ancora presenti (senza duplicarle). */
export function missingRecurring(plan: Pick<MonthPlan, 'mese' | 'spesePreviste'>, ricorrenze: Recurring[]): PlannedExpense[] {
  const present = new Set(plan.spesePreviste.map((p) => p.ricorrenzaId).filter(Boolean));
  return ricorrenze
    .filter((r) => occursIn(r, plan.mese) && !present.has(r.id))
    .map(plannedFromRecurring);
}

export function transactionsOfMonth<T extends Transaction>(movimenti: T[], month: MonthKey): T[] {
  return movimenti.filter((t) => monthOfDate(t.data) === month);
}

export interface TransferBreakdown {
  cointestato: Cents;
  risparmio: Cents;
  investimenti: Cents;
  obiettivi: Cents;
  altro: Cents;
}

export function transferBreakdown(trasferimenti: TransferLine[], conti: Account[]): TransferBreakdown {
  const result: TransferBreakdown = { cointestato: 0, risparmio: 0, investimenti: 0, obiettivi: 0, altro: 0 };
  const byId = new Map(conti.map((c) => [c.id, c]));
  for (const t of trasferimenti) {
    if (t.obiettivoId) result.obiettivi += t.importo;
    else {
      const tipo = t.contoId ? byId.get(t.contoId)?.tipo : undefined;
      if (tipo === 'cointestato' || tipo === 'risparmio' || tipo === 'investimenti') result[tipo] += t.importo;
      else result.altro += t.importo;
    }
  }
  return result;
}

export interface PlanSummary {
  entrate: Cents;
  trasferimenti: Cents;
  budget: Cents;
  /** Entrate non assegnate né a trasferimenti né a budget (negativo = piano in deficit). */
  nonAllocato: Cents;
  speso: Cents;
  spesoPianificato: Cents;
  spesoEstemporaneo: Cents;
  /** Budget rimasto da spendere. */
  residuo: Cents;
  previste: Cents;
  previstePagate: Cents;
  previsteDaPagare: Cents;
  trasferimentiEseguiti: Cents;
}

export function summarizePlan(plan: MonthPlan, movimentiMese: Transaction[]): PlanSummary {
  const entrate = sum(plan.entrate, (e) => e.importo);
  const trasferimenti = sum(plan.trasferimenti, (t) => t.importo);
  const budget = sum(Object.values(plan.budget), (b) => b);
  const speso = sum(movimentiMese, (t) => t.importo);
  const spesoPianificato = sum(movimentiMese.filter((t) => t.previstaId), (t) => t.importo);
  const previste = sum(plan.spesePreviste, (p) => p.importo);
  const previstePagate = sum(plan.spesePreviste.filter((p) => p.movimentoId), (p) => p.importo);
  return {
    entrate,
    trasferimenti,
    budget,
    nonAllocato: entrate - trasferimenti - budget,
    speso,
    spesoPianificato,
    spesoEstemporaneo: speso - spesoPianificato,
    residuo: budget - speso,
    previste,
    previstePagate,
    previsteDaPagare: previste - previstePagate,
    trasferimentiEseguiti: sum(plan.trasferimenti.filter((t) => t.eseguito), (t) => t.importo),
  };
}

export interface CategoryRow {
  categoria: Category;
  budget: Cents;
  previsto: Cents;
  speso: Cents;
  residuo: Cents;
  /** Quota di budget consumata (0-100+). */
  utilizzo: number;
}

/** Righe per categoria: budget, spese previste e spese effettive del mese. */
export function categoryRows(
  plan: Pick<MonthPlan, 'budget' | 'spesePreviste'> | undefined,
  movimentiMese: Transaction[],
  categorie: Category[],
): CategoryRow[] {
  const spent = new Map<ID, Cents>();
  for (const t of movimentiMese) spent.set(t.categoriaId, (spent.get(t.categoriaId) ?? 0) + t.importo);
  const planned = new Map<ID, Cents>();
  for (const p of plan?.spesePreviste ?? []) planned.set(p.categoriaId, (planned.get(p.categoriaId) ?? 0) + p.importo);

  return categorie
    .map((categoria) => {
      const budget = plan?.budget[categoria.id] ?? 0;
      const speso = spent.get(categoria.id) ?? 0;
      return {
        categoria,
        budget,
        previsto: planned.get(categoria.id) ?? 0,
        speso,
        residuo: budget - speso,
        utilizzo: budget ? Math.round((speso / budget) * 100) : speso ? 999 : 0,
      };
    })
    .filter((r) => !r.categoria.archiviata || r.budget || r.speso || r.previsto);
}
