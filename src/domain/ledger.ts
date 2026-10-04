// Calcoli su un singolo conto: piano mensile, versamenti in arrivo, saldo, quote dei conti condivisi.
import { newId } from './id';
import { sum } from './money';
import { dayOfMonth, lastMonths, monthIndex, monthOfDate } from './month';
import { monthlyEquivalent, occurrencesInMonth } from './schedule';
import type { Account, AppData, Category, Cents, DateKey, ID, MonthKey, MonthPlan, PlannedExpense, Recurring, Transaction, TransferLine } from './types';

export function findAccount(data: AppData, id: ID | undefined): Account | undefined {
  return id ? data.conti.find((a) => a.id === id) : undefined;
}

export function activeAccounts(data: AppData): Account[] {
  return data.conti.filter((a) => !a.archiviato);
}

/** Il conto predefinito: il primo conto personale attivo, o il primo conto attivo. */
export function primaryAccount(data: AppData): Account | undefined {
  const active = activeAccounts(data);
  return active.find((a) => a.tipo === 'personale') ?? active[0];
}

/** Nome di chi possiede il conto (titolare) o, in mancanza, il nome del conto. */
export function ownerName(account: Account | undefined): string {
  if (!account) return 'Conto eliminato';
  return account.titolare?.trim() || account.nome;
}

// ---------- Spese previste ----------

function plannedFromRecurring(r: Recurring, data?: DateKey): PlannedExpense {
  return { id: newId(), descrizione: r.descrizione, categoriaId: r.categoriaId, importo: r.importo, data, ricorrenzaId: r.id };
}

/** Spese previste generate dalle ricorrenze del mese (una per ogni occorrenza). */
export function recurringForMonth(ricorrenze: Recurring[], month: MonthKey): PlannedExpense[] {
  return ricorrenze.flatMap((r) => occurrencesInMonth(r, month).map((d) => plannedFromRecurring(r, d)));
}

/** Occorrenze delle ricorrenze del mese non ancora presenti nel piano. */
export function missingRecurring(plan: Pick<MonthPlan, 'mese' | 'spesePreviste'>, ricorrenze: Recurring[]): PlannedExpense[] {
  const present = new Set(plan.spesePreviste.filter((p) => p.ricorrenzaId).map((p) => `${p.ricorrenzaId}|${p.data ?? ''}`));
  return recurringForMonth(ricorrenze, plan.mese).filter((p) => !present.has(`${p.ricorrenzaId}|${p.data ?? ''}`));
}

/** Ordina per data (le spese senza data in fondo). */
export function byDate(a: { data?: DateKey }, b: { data?: DateKey }): number {
  return (a.data ?? '9999').localeCompare(b.data ?? '9999');
}

/** Crea il piano del mese dal modello del conto, con le spese ricorrenti; il budget copre almeno le spese previste. */
export function createPlan(account: Account, month: MonthKey): MonthPlan {
  const { modello } = account;
  const spesePreviste = recurringForMonth(account.ricorrenze, month);
  const budget = { ...modello.budget };
  const previsto: Record<ID, Cents> = {};
  for (const p of spesePreviste) previsto[p.categoriaId] = (previsto[p.categoriaId] ?? 0) + p.importo;
  for (const [id, v] of Object.entries(previsto)) budget[id] = Math.max(budget[id] ?? 0, v);
  return {
    mese: month,
    entrate: modello.entrate.map((e) => ({ ...e, id: newId() })),
    trasferimenti: modello.trasferimenti.map((t) => ({ ...t, id: newId(), eseguito: false })),
    budget,
    spesePreviste,
  };
}

export function transactionsOfMonth<T extends Transaction>(movimenti: T[], month: MonthKey): T[] {
  return movimenti.filter((t) => monthOfDate(t.data) === month);
}

// ---------- Versamenti tra conti ----------

/** Conto su cui arrivano i soldi di una quota: il conto indicato o quello dell'obiettivo. */
export function transferTarget(data: AppData, t: Pick<TransferLine, 'contoId' | 'obiettivoId'>): ID | undefined {
  if (t.obiettivoId) return data.obiettivi.find((g) => g.id === t.obiettivoId)?.contoId;
  return t.contoId;
}

export interface IncomingTransfer {
  from: Account;
  line: TransferLine;
}

/** Quote che altri conti versano su questo conto nel mese (anche tramite un obiettivo che vive qui). */
export function incomingTransfers(data: AppData, accountId: ID, month: MonthKey): IncomingTransfer[] {
  const result: IncomingTransfer[] = [];
  for (const from of data.conti) {
    if (from.id === accountId) continue;
    for (const line of from.piani[month]?.trasferimenti ?? []) if (transferTarget(data, line) === accountId) result.push({ from, line });
  }
  return result;
}

/** Spese di altri conti anticipate da questo conto. */
export function anticipatedFor(data: AppData, accountId: ID): { account: Account; tx: Transaction }[] {
  return data.conti.flatMap((account) => account.movimenti.filter((tx) => tx.pagatoDa === accountId).map((tx) => ({ account, tx })));
}

// ---------- Riepilogo del mese ----------

export interface PlanSummary {
  /** Entrate proprie del conto (stipendio, extra). */
  entrate: Cents;
  /** Versamenti previsti da altri conti. */
  inArrivo: Cents;
  inArrivoRicevuti: Cents;
  /** Quote verso altri conti e obiettivi. */
  trasferimenti: Cents;
  trasferimentiEseguiti: Cents;
  budget: Cents;
  /** Risorse non assegnate né a quote né a budget (negativo = piano in deficit). */
  nonAllocato: Cents;
  speso: Cents;
  spesoPianificato: Cents;
  spesoEstemporaneo: Cents;
  /** Budget rimasto da spendere. */
  residuo: Cents;
  previste: Cents;
  previstePagate: Cents;
  previsteDaPagare: Cents;
  /** Spese di questo conto anticipate da altri e non ancora restituite. */
  daRimborsare: Cents;
}

export function summarizePlan(data: AppData, account: Account, month: MonthKey): PlanSummary {
  const plan = account.piani[month];
  const tx = transactionsOfMonth(account.movimenti, month);
  const incoming = incomingTransfers(data, account.id, month);
  // Tutte le quote contano come allocate, anche verso un obiettivo che vive su questo conto.
  const outgoing = plan?.trasferimenti ?? [];
  const entrate = sum(plan?.entrate ?? [], (e) => e.importo);
  const inArrivo = sum(incoming, (i) => i.line.importo);
  const trasferimenti = sum(outgoing, (t) => t.importo);
  const budget = sum(Object.values(plan?.budget ?? {}), (b) => b);
  const speso = sum(tx, (t) => t.importo);
  const spesoPianificato = sum(tx.filter((t) => t.previstaId), (t) => t.importo);
  const previste = sum(plan?.spesePreviste ?? [], (p) => p.importo);
  const previstePagate = sum((plan?.spesePreviste ?? []).filter((p) => p.movimentoId), (p) => p.importo);
  return {
    entrate,
    inArrivo,
    inArrivoRicevuti: sum(incoming.filter((i) => i.line.eseguito), (i) => i.line.importo),
    trasferimenti,
    trasferimentiEseguiti: sum(outgoing.filter((t) => t.eseguito), (t) => t.importo),
    budget,
    nonAllocato: entrate + inArrivo - trasferimenti - budget,
    speso,
    spesoPianificato,
    spesoEstemporaneo: speso - spesoPianificato,
    residuo: budget - speso,
    previste,
    previstePagate,
    previsteDaPagare: previste - previstePagate,
    daRimborsare: sum(account.movimenti.filter((t) => t.pagatoDa && !t.rimborsato), (t) => t.importo),
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
export function categoryRows(plan: Pick<MonthPlan, 'budget' | 'spesePreviste'> | undefined, movimentiMese: Transaction[], categorie: Category[]): CategoryRow[] {
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

// ---------- Saldo ----------

export interface BalancePoint {
  mese: MonthKey;
  entrate: Cents;
  uscite: Cents;
  saldo: Cents;
}

/**
 * Andamento stimato del saldo mese per mese, a partire dal saldo iniziale del conto.
 * Entrano: entrate proprie (dal giorno dello stipendio), versamenti ricevuti da altri conti, rimborsi ricevuti.
 * Escono: quote versate, spese pagate dal conto, spese anticipate per altri conti.
 */
export function balanceHistory(data: AppData, account: Account, until: MonthKey, today: DateKey): BalancePoint[] {
  const count = monthIndex(until) - monthIndex(account.meseSaldoIniziale) + 1;
  if (count <= 0) return [];
  const thisMonth = monthOfDate(today);
  const anticipated = anticipatedFor(data, account.id);
  let saldo = account.saldoIniziale;
  return lastMonths(until, count).map((mese) => {
    const plan = account.piani[mese];
    const arrived = monthIndex(mese) < monthIndex(thisMonth) || (mese === thisMonth && dayOfMonth(today) >= (account.giornoStipendio ?? 1));
    const ownIncome = arrived ? sum(plan?.entrate ?? [], (e) => e.importo) : 0;
    const received = sum(
      incomingTransfers(data, account.id, mese).filter((i) => i.line.eseguito),
      (i) => i.line.importo,
    );
    const sent = sum(
      (plan?.trasferimenti ?? []).filter((t) => t.eseguito && transferTarget(data, t) !== account.id),
      (t) => t.importo,
    );
    const spent = sum(
      account.movimenti.filter((t) => monthOfDate(t.data) === mese && (!t.pagatoDa || t.rimborsato)),
      (t) => t.importo,
    );
    const inMonth = anticipated.filter((a) => monthOfDate(a.tx.data) === mese);
    const advanced = sum(inMonth, (a) => a.tx.importo);
    const reimbursed = sum(inMonth.filter((a) => a.tx.rimborsato), (a) => a.tx.importo);
    const entrate = ownIncome + received + reimbursed;
    const uscite = sent + spent + advanced;
    saldo += entrate - uscite;
    return { mese, entrate, uscite, saldo };
  });
}

export function currentBalance(data: AppData, account: Account, month: MonthKey, today: DateKey): Cents {
  const history = balanceHistory(data, account, month, today);
  return history.length ? history[history.length - 1]!.saldo : account.saldoIniziale;
}

// ---------- Conti condivisi: quote ----------

export const splitRuleLabels = {
  paritaria: 'In parti uguali',
  proporzionale: 'In proporzione alle entrate',
  percentuale: 'Percentuali fisse',
} as const;

export function participants(data: AppData, account: Account): Account[] {
  return (account.ripartizione?.partecipanti ?? []).map((id) => findAccount(data, id)).filter((a): a is Account => !!a && !a.archiviato);
}

/** Quota di ciascun partecipante (somma 1). Proporzionale: in base alle entrate del modello di ogni conto. */
export function shares(data: AppData, account: Account): Record<ID, number> {
  const list = participants(data, account);
  const split = account.ripartizione;
  if (!split || list.length === 0) return {};
  const equal = Object.fromEntries(list.map((a) => [a.id, 1 / list.length]));
  if (split.regola === 'paritaria') return equal;
  const weights =
    split.regola === 'percentuale'
      ? list.map((a) => Math.max(0, split.percentuali[a.id] ?? 0))
      : list.map((a) => sum(a.modello.entrate, (e) => e.importo));
  const total = sum(weights, (w) => w);
  if (total <= 0) return equal;
  return Object.fromEntries(list.map((a, i) => [a.id, weights[i]! / total]));
}

/** Divide un fabbisogno tra i partecipanti, arrotondando ogni quota per eccesso. */
export function splitAmount(data: AppData, account: Account, total: Cents): Record<ID, Cents> {
  const step = Math.max(1, account.ripartizione?.arrotondamento ?? 1);
  const s = shares(data, account);
  return Object.fromEntries(Object.entries(s).map(([id, share]) => [id, Math.ceil(Math.round(total * share) / step) * step]));
}

/** Quanto ogni partecipante prevede di versare sul conto nel mese (dal proprio piano). */
export function plannedContributions(data: AppData, account: Account, month: MonthKey): Record<ID, { importo: Cents; eseguito: boolean; hasPlan: boolean }> {
  const result: Record<ID, { importo: Cents; eseguito: boolean; hasPlan: boolean }> = {};
  for (const p of participants(data, account)) {
    const lines = (p.piani[month]?.trasferimenti ?? []).filter((t) => t.contoId === account.id);
    result[p.id] = {
      importo: sum(lines, (t) => t.importo),
      eseguito: lines.length > 0 && lines.every((t) => t.eseguito),
      hasPlan: !!p.piani[month],
    };
  }
  return result;
}

/**
 * Fabbisogno medio mensile secondo il modello: per ogni categoria il budget del modello
 * o, se più alto, il costo mensile equivalente delle spese ricorrenti.
 */
export function averageNeed(account: Account): Cents {
  const recurring: Record<ID, Cents> = {};
  for (const r of account.ricorrenze.filter((x) => x.attiva)) recurring[r.categoriaId] = (recurring[r.categoriaId] ?? 0) + monthlyEquivalent(r);
  const ids = new Set([...Object.keys(account.modello.budget), ...Object.keys(recurring)]);
  return sum([...ids], (id) => Math.max(account.modello.budget[id] ?? 0, recurring[id] ?? 0));
}
