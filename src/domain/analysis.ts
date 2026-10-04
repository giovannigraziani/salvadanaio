// Statistiche e suggerimenti per un conto su un periodo di mesi.
import { incomingTransfers, shares, transactionsOfMonth } from './ledger';
import { sum } from './money';
import { lastMonths } from './month';
import { monthlyEquivalent } from './schedule';
import type { Account, AppData, Category, Cents, ID, MonthKey } from './types';

export interface MonthStats {
  mese: MonthKey;
  hasPlan: boolean;
  /** Entrate proprie più versamenti previsti da altri conti. */
  entrate: Cents;
  /** Quote in uscita per destinazione: "conto:<id>" o "obiettivo:<id>". */
  uscite: Record<string, Cents>;
  /** Versamenti ricevuti da ciascun conto (solo quelli eseguiti). */
  ricevutoDa: Record<ID, Cents>;
  budget: Cents;
  speso: Cents;
  spesoPianificato: Cents;
  spesoEstemporaneo: Cents;
  perCategoria: Record<ID, Cents>;
  /** Solo spese non collegate a una spesa prevista. */
  estemporaneePerCategoria: Record<ID, Cents>;
}

export function monthStats(data: AppData, account: Account, month: MonthKey): MonthStats {
  const plan = account.piani[month];
  const tx = transactionsOfMonth(account.movimenti, month);
  const perCategoria: Record<ID, Cents> = {};
  const estemporaneePerCategoria: Record<ID, Cents> = {};
  for (const t of tx) {
    perCategoria[t.categoriaId] = (perCategoria[t.categoriaId] ?? 0) + t.importo;
    if (!t.previstaId) estemporaneePerCategoria[t.categoriaId] = (estemporaneePerCategoria[t.categoriaId] ?? 0) + t.importo;
  }
  const uscite: Record<string, Cents> = {};
  for (const t of plan?.trasferimenti ?? []) {
    const key = t.obiettivoId ? `obiettivo:${t.obiettivoId}` : `conto:${t.contoId ?? ''}`;
    uscite[key] = (uscite[key] ?? 0) + t.importo;
  }
  const incoming = incomingTransfers(data, account.id, month);
  const ricevutoDa: Record<ID, Cents> = {};
  for (const i of incoming) if (i.line.eseguito) ricevutoDa[i.from.id] = (ricevutoDa[i.from.id] ?? 0) + i.line.importo;
  const speso = sum(tx, (t) => t.importo);
  const spesoPianificato = sum(tx.filter((t) => t.previstaId), (t) => t.importo);
  return {
    mese: month,
    hasPlan: !!plan,
    entrate: sum(plan?.entrate ?? [], (e) => e.importo) + sum(incoming, (i) => i.line.importo),
    uscite,
    ricevutoDa,
    budget: sum(Object.values(plan?.budget ?? {}), (b) => b),
    speso,
    spesoPianificato,
    spesoEstemporaneo: speso - spesoPianificato,
    perCategoria,
    estemporaneePerCategoria,
  };
}

/** Statistiche dei mesi che hanno almeno un piano o un movimento. */
export function rangeStats(data: AppData, account: Account, end: MonthKey, count: number): MonthStats[] {
  return lastMonths(end, count)
    .map((m) => monthStats(data, account, m))
    .filter((s) => s.hasPlan || s.speso > 0);
}

/** true se la destinazione è un accantonamento: conto risparmi/investimenti o obiettivo. */
function isSaving(data: AppData, key: string): boolean {
  const [kind, id] = key.split(':');
  if (kind === 'obiettivo') return true;
  const tipo = data.conti.find((a) => a.id === id)?.tipo;
  return tipo === 'risparmio' || tipo === 'investimenti';
}

export function savedOf(data: AppData, s: MonthStats): Cents {
  return sum(Object.entries(s.uscite), ([k, v]) => (isSaving(data, k) ? v : 0));
}

/** Quota delle entrate messa da parte (conti risparmio, investimenti, obiettivi). */
export function savingsRate(data: AppData, stats: MonthStats[]): number {
  const entrate = sum(stats, (s) => s.entrate);
  if (!entrate) return 0;
  return Math.round((sum(stats, (s) => savedOf(data, s)) / entrate) * 100);
}

export function destinationLabel(data: AppData, key: string): string {
  const [kind, id] = key.split(':');
  if (kind === 'obiettivo') return `Obiettivo ${data.obiettivi.find((g) => g.id === id)?.nome ?? 'eliminato'}`;
  return data.conti.find((a) => a.id === id)?.nome ?? 'Senza destinazione';
}

export interface Slice {
  key: string;
  label: string;
  value: Cents;
}

/** Dove sono andate le entrate del periodo: quote per destinazione, spese per tipo e quanto è avanzato. */
export function moneyFlow(data: AppData, stats: MonthStats[], categorie: Category[]): { slices: Slice[]; entrate: Cents; avanzo: Cents } {
  const entrate = sum(stats, (s) => s.entrate);
  const totals: Record<string, Cents> = {};
  for (const s of stats) for (const [k, v] of Object.entries(s.uscite)) totals[k] = (totals[k] ?? 0) + v;
  const slices: Slice[] = Object.entries(totals)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ key, label: destinationLabel(data, key), value }));
  const kinds = spendingByKind(stats, categorie);
  slices.push({ key: 'spese:essenziale', label: 'Spese essenziali', value: kinds.essenziale });
  slices.push({ key: 'spese:discrezionale', label: 'Spese discrezionali', value: kinds.discrezionale });
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
 * Confronta il budget del modello con il fabbisogno reale di ogni categoria e propone come ridistribuirlo.
 * Il fabbisogno è la spesa estemporanea media degli ultimi mesi più il costo mensile equivalente
 * delle ricorrenze: un'assicurazione trimestrale pesa per un terzo ogni mese invece di falsare la media.
 * - "aumenta": il fabbisogno supera il budget di oltre il 10%;
 * - "riduci": il fabbisogno è sotto il budget di oltre il 25%;
 * - "senza-budget": si spende regolarmente in una categoria senza budget.
 */
export function budgetSuggestions(data: AppData, account: Account, end: MonthKey, count = 3): Suggestion[] {
  const stats = rangeStats(data, account, end, count).filter((s) => s.hasPlan);
  if (stats.length === 0) return [];
  const result: Suggestion[] = [];
  const active = account.ricorrenze.filter((r) => r.attiva && (!r.fine || r.fine.slice(0, 7) >= end));

  for (const categoria of account.categorie.filter((c) => !c.archiviata)) {
    const budget = account.modello.budget[categoria.id] ?? 0;
    const estemporanee = stats.map((s) => s.estemporaneePerCategoria[categoria.id] ?? 0);
    const mediaEstemporanea = Math.round(sum(estemporanee, (v) => v) / stats.length);
    const ricorrenti = sum(active.filter((r) => r.categoriaId === categoria.id), monthlyEquivalent);
    const fabbisogno = mediaEstemporanea + ricorrenti;
    // Nel piano il budget viene comunque alzato per coprire le ricorrenze del mese.
    const effettivo = Math.max(budget, ricorrenti);
    const mesiSforati = stats.filter((s) => (s.perCategoria[categoria.id] ?? 0) > (account.piani[s.mese]?.budget[categoria.id] ?? 0)).length;
    const base = { categoria, budget, fabbisogno, mediaEstemporanea, ricorrenti, mesi: stats.length, mesiSforati };
    const used = stats.filter((s) => (s.perCategoria[categoria.id] ?? 0) > 0).length;

    if (effettivo === 0) {
      if (fabbisogno > 0 && used >= Math.min(2, stats.length)) result.push({ ...base, kind: 'senza-budget', proposto: roundTo5Euro(fabbisogno) });
    } else if (fabbisogno > effettivo * 1.1) {
      result.push({ ...base, kind: budget === 0 ? 'senza-budget' : 'aumenta', proposto: roundTo5Euro(fabbisogno) });
    } else if (budget > 0 && fabbisogno < budget * 0.75) {
      result.push({ ...base, kind: 'riduci', proposto: roundTo5Euro(fabbisogno * 1.1) });
    }
  }
  const weight = (s: Suggestion) => Math.abs(s.proposto - s.budget);
  return result.sort((a, b) => weight(b) - weight(a));
}

/** Spesa per tipo di categoria (essenziale / discrezionale). */
export function spendingByKind(stats: MonthStats[], categorie: Category[]): { essenziale: Cents; discrezionale: Cents } {
  const kind = new Map(categorie.map((c) => [c.id, c.tipo]));
  const totals = { essenziale: 0, discrezionale: 0 };
  for (const s of stats)
    for (const [id, value] of Object.entries(s.perCategoria)) totals[kind.get(id) ?? 'discrezionale'] += value;
  return totals;
}

export interface ContributionRow {
  conto: Account;
  versato: Cents;
  /** Parte delle spese del conto che spetta al partecipante secondo la regola. */
  carico: Cents;
}

/** Per un conto condiviso: quanto ha versato ogni partecipante rispetto alla sua parte di spese. */
export function contributionRows(data: AppData, account: Account, stats: MonthStats[]): ContributionRow[] {
  const s = shares(data, account);
  const speso = sum(stats, (m) => m.speso);
  return Object.entries(s).map(([id, share]) => ({
    conto: data.conti.find((a) => a.id === id)!,
    versato: sum(stats, (m) => m.ricevutoDa[id] ?? 0),
    carico: Math.round(speso * share),
  }));
}
