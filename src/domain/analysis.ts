import { sum } from './money';
import { lastMonths } from './month';
import { monthlyEquivalent } from './recurring';
import { transactionsOfMonth, transferBreakdown, type TransferBreakdown } from './plan';
import type { AppData, Category, Cents, ID, MonthKey } from './types';

export interface MonthStats {
  mese: MonthKey;
  hasPlan: boolean;
  entrate: Cents;
  trasferimenti: TransferBreakdown;
  budget: Cents;
  speso: Cents;
  spesoPianificato: Cents;
  spesoEstemporaneo: Cents;
  perCategoria: Record<ID, Cents>;
  /** Solo spese non collegate a una spesa prevista. */
  estemporaneePerCategoria: Record<ID, Cents>;
}

export function monthStats(data: AppData, month: MonthKey): MonthStats {
  const plan = data.piani[month];
  const tx = transactionsOfMonth(data.movimenti, month);
  const perCategoria: Record<ID, Cents> = {};
  const estemporaneePerCategoria: Record<ID, Cents> = {};
  for (const t of tx) {
    perCategoria[t.categoriaId] = (perCategoria[t.categoriaId] ?? 0) + t.importo;
    if (!t.previstaId) estemporaneePerCategoria[t.categoriaId] = (estemporaneePerCategoria[t.categoriaId] ?? 0) + t.importo;
  }
  const speso = sum(tx, (t) => t.importo);
  const spesoPianificato = sum(tx.filter((t) => t.previstaId), (t) => t.importo);
  return {
    mese: month,
    hasPlan: !!plan,
    entrate: sum(plan?.entrate ?? [], (e) => e.importo),
    trasferimenti: transferBreakdown(plan?.trasferimenti ?? [], data.conti),
    budget: sum(Object.values(plan?.budget ?? {}), (b) => b),
    speso,
    spesoPianificato,
    spesoEstemporaneo: speso - spesoPianificato,
    perCategoria,
    estemporaneePerCategoria,
  };
}

/** Statistiche dei mesi che hanno almeno un piano o un movimento. */
export function rangeStats(data: AppData, end: MonthKey, count: number): MonthStats[] {
  return lastMonths(end, count)
    .map((m) => monthStats(data, m))
    .filter((s) => s.hasPlan || s.speso > 0);
}

export function savedOf(s: MonthStats): Cents {
  return s.trasferimenti.risparmio + s.trasferimenti.investimenti + s.trasferimenti.obiettivi;
}

/** Quota delle entrate messa da parte (risparmi, investimenti, obiettivi). */
export function savingsRate(stats: MonthStats[]): number {
  const entrate = sum(stats, (s) => s.entrate);
  if (!entrate) return 0;
  return Math.round((sum(stats, savedOf) / entrate) * 100);
}

export interface Slice {
  key: string;
  label: string;
  value: Cents;
}

/** Dove sono andate le entrate del periodo: conti, obiettivi, spese per categoria e quanto è avanzato. */
export function moneyFlow(stats: MonthStats[], categorie: Category[]): { slices: Slice[]; entrate: Cents; avanzo: Cents } {
  const entrate = sum(stats, (s) => s.entrate);
  const t = (k: keyof TransferBreakdown) => sum(stats, (s) => s.trasferimenti[k]);
  const slices: Slice[] = [
    { key: 'cointestato', label: 'Conto cointestato', value: t('cointestato') },
    { key: 'risparmio', label: 'Risparmi', value: t('risparmio') },
    { key: 'investimenti', label: 'Investimenti', value: t('investimenti') },
    { key: 'obiettivi', label: 'Obiettivi', value: t('obiettivi') },
    { key: 'altro', label: 'Altri trasferimenti', value: t('altro') },
  ];
  for (const c of categorie) {
    const value = sum(stats, (s) => s.perCategoria[c.id] ?? 0);
    if (value) slices.push({ key: `categoria:${c.id}`, label: c.nome, value });
  }
  const used = sum(slices, (s) => s.value);
  return { slices: slices.filter((s) => s.value > 0), entrate, avanzo: entrate - used };
}

export type SuggestionKind = 'aumenta' | 'riduci' | 'senza-budget';

export interface Suggestion {
  kind: SuggestionKind;
  categoria: Category;
  /** Budget del modello mensile. */
  budget: Cents;
  /** Fabbisogno mensile stimato: spesa estemporanea media + quota mensile delle ricorrenze. */
  fabbisogno: Cents;
  mediaEstemporanea: Cents;
  ricorrenti: Cents;
  /** Nuovo budget proposto per il modello. */
  proposto: Cents;
  /** Mesi analizzati. */
  mesi: number;
  /** Mesi in cui il budget del piano è stato superato. */
  mesiSforati: number;
}

const roundTo5Euro = (cents: Cents) => Math.ceil(cents / 500) * 500;

/**
 * Confronta il budget del modello mensile con il fabbisogno reale di ogni categoria
 * e propone come ridistribuirlo. Il fabbisogno è la spesa estemporanea media degli ultimi
 * mesi più il costo medio mensile delle spese ricorrenti: così un'assicurazione trimestrale
 * pesa per un terzo ogni mese invece di falsare la media.
 * - "aumenta": il fabbisogno supera il budget di oltre il 10% → il budget è irrealistico.
 * - "riduci": il fabbisogno è sotto il budget di oltre il 25% → c'è margine da liberare.
 * - "senza-budget": si spende regolarmente in una categoria senza budget.
 */
export function budgetSuggestions(data: AppData, end: MonthKey, count = 3): Suggestion[] {
  const stats = rangeStats(data, end, count).filter((s) => s.hasPlan);
  if (stats.length === 0) return [];
  const result: Suggestion[] = [];
  const active = data.ricorrenze.filter((r) => r.attiva && (!r.meseFine || r.meseFine >= end));

  for (const categoria of data.categorie.filter((c) => !c.archiviata)) {
    const budget = data.modello.budget[categoria.id] ?? 0;
    const estemporanee = stats.map((s) => s.estemporaneePerCategoria[categoria.id] ?? 0);
    const mediaEstemporanea = Math.round(sum(estemporanee, (v) => v) / stats.length);
    const ricorrenti = sum(active.filter((r) => r.categoriaId === categoria.id), monthlyEquivalent);
    const fabbisogno = mediaEstemporanea + ricorrenti;
    const mesiSforati = stats.filter((s) => (s.perCategoria[categoria.id] ?? 0) > (data.piani[s.mese]?.budget[categoria.id] ?? 0)).length;
    const base = { categoria, budget, fabbisogno, mediaEstemporanea, ricorrenti, mesi: stats.length, mesiSforati };
    const used = stats.filter((s) => (s.perCategoria[categoria.id] ?? 0) > 0).length;

    if (budget === 0) {
      if (fabbisogno > 0 && (ricorrenti > 0 || used >= Math.min(2, stats.length)))
        result.push({ ...base, kind: 'senza-budget', proposto: roundTo5Euro(fabbisogno) });
    } else if (fabbisogno > budget * 1.1) {
      result.push({ ...base, kind: 'aumenta', proposto: roundTo5Euro(fabbisogno) });
    } else if (fabbisogno < budget * 0.75) {
      result.push({ ...base, kind: 'riduci', proposto: roundTo5Euro(fabbisogno * 1.1) });
    }
  }
  const weight = (s: Suggestion) => Math.abs(s.proposto - s.budget);
  return result.sort((a, b) => weight(b) - weight(a));
}

/** Spesa mensile media per tipo di categoria (essenziale / discrezionale). */
export function spendingByKind(stats: MonthStats[], categorie: Category[]): { essenziale: Cents; discrezionale: Cents } {
  const kind = new Map(categorie.map((c) => [c.id, c.tipo]));
  const totals = { essenziale: 0, discrezionale: 0 };
  for (const s of stats)
    for (const [id, value] of Object.entries(s.perCategoria)) totals[kind.get(id) ?? 'discrezionale'] += value;
  return totals;
}
