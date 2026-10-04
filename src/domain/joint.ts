import { sum } from './money';
import { lastMonths, monthIndex, monthOfDate } from './month';
import { categoryRows, plannedFromRecurring, transactionsOfMonth } from './plan';
import { monthlyEquivalent, occursIn } from './recurring';
import type { AppData, Cents, ID, JointPlan, JointSettings, JointTransaction, MonthKey, Partner, SplitRule } from './types';

export const splitRuleLabels: Record<SplitRule, string> = {
  paritaria: 'A metà',
  proporzionale: 'In proporzione allo stipendio',
  percentuale: 'Percentuale fissa',
};

/** Conto cointestato configurato, o il primo conto di tipo cointestato. */
export function jointAccountId(data: AppData): ID | undefined {
  const configured = data.cointestato.impostazioni.contoId;
  if (configured && data.conti.some((c) => c.id === configured)) return configured;
  return data.conti.find((c) => c.tipo === 'cointestato')?.id;
}

export function personName(data: AppData, who: Partner | 'conto'): string {
  if (who === 'conto') return 'Conto cointestato';
  return who === 'io' ? data.settings.nome || 'Io' : data.cointestato.impostazioni.nomePartner || 'Partner';
}

/** Quota delle spese comuni a mio carico, tra 0 e 1. */
export function myShare(s: JointSettings): number {
  if (s.regola === 'paritaria') return 0.5;
  if (s.regola === 'percentuale') return Math.min(100, Math.max(0, s.percentualeIo)) / 100;
  const total = s.redditoIo + s.redditoPartner;
  return total > 0 ? s.redditoIo / total : 0.5;
}

/** Divide un fabbisogno tra le due persone, arrotondando le quote per eccesso. */
export function splitAmount(s: JointSettings, total: Cents): Record<Partner, Cents> {
  const step = Math.max(1, s.arrotondamento);
  const round = (v: number) => Math.ceil(Math.round(v) / step) * step;
  const share = myShare(s);
  return { io: round(total * share), partner: round(total * (1 - share)) };
}

export function createJointPlan(data: AppData, month: MonthKey): JointPlan {
  const joint = data.cointestato;
  const spesePreviste = joint.ricorrenze.filter((r) => occursIn(r, month)).map(plannedFromRecurring);
  const budget = { ...joint.modelloBudget };
  // Il budget di ogni categoria copre almeno le spese previste del mese.
  for (const p of spesePreviste) {
    const previsto = sum(spesePreviste.filter((x) => x.categoriaId === p.categoriaId), (x) => x.importo);
    budget[p.categoriaId] = Math.max(budget[p.categoriaId] ?? 0, previsto);
  }
  const fabbisogno = sum(Object.values(budget), (v) => v);
  return {
    mese: month,
    budget,
    spesePreviste,
    versamentoPartner: { importo: splitAmount(joint.impostazioni, fabbisogno).partner, eseguito: false },
  };
}

/** Il mio versamento verso il conto cointestato nel mese: le quote del mio piano personale dirette a quel conto. */
export function myContribution(data: AppData, month: MonthKey): { importo: Cents; eseguito: boolean; ids: ID[]; hasPlan: boolean } {
  const plan = data.piani[month];
  const contoId = jointAccountId(data);
  const lines = (plan?.trasferimenti ?? []).filter((t) => contoId && t.contoId === contoId);
  return {
    importo: sum(lines, (t) => t.importo),
    eseguito: lines.length > 0 && lines.every((t) => t.eseguito),
    ids: lines.map((t) => t.id),
    hasPlan: !!plan,
  };
}

/** true se la spesa è uscita dal conto (pagata direttamente o rimborsata a chi l'ha anticipata). */
export function leftTheAccount(t: JointTransaction): boolean {
  return t.pagatoDa === 'conto' || !!t.rimborsato;
}

export interface JointMonthSummary {
  budget: Cents;
  previste: Cents;
  previstePagate: Cents;
  speso: Cents;
  spesoPianificato: Cents;
  residuo: Cents;
  quote: Record<Partner, Cents>;
  versamenti: Record<Partner, { importo: Cents; eseguito: boolean }>;
  versato: Cents;
  /** Spese anticipate da una persona e non ancora rimborsate dal conto. */
  daRimborsare: Record<Partner, Cents>;
}

export function jointMonthSummary(data: AppData, month: MonthKey): JointMonthSummary {
  const joint = data.cointestato;
  const plan = joint.piani[month];
  const tx = transactionsOfMonth(joint.movimenti, month);
  const budget = sum(Object.values(plan?.budget ?? {}), (v) => v);
  const speso = sum(tx, (t) => t.importo);
  const mine = myContribution(data, month);
  const partner = plan?.versamentoPartner ?? { importo: 0, eseguito: false };
  const pending = (who: Partner) => sum(tx.filter((t) => t.pagatoDa === who && !t.rimborsato), (t) => t.importo);
  return {
    budget,
    previste: sum(plan?.spesePreviste ?? [], (p) => p.importo),
    previstePagate: sum((plan?.spesePreviste ?? []).filter((p) => p.movimentoId), (p) => p.importo),
    speso,
    spesoPianificato: sum(tx.filter((t) => t.previstaId), (t) => t.importo),
    residuo: budget - speso,
    quote: splitAmount(joint.impostazioni, budget),
    versamenti: { io: { importo: mine.importo, eseguito: mine.eseguito }, partner },
    versato: (mine.eseguito ? mine.importo : 0) + (partner.eseguito ? partner.importo : 0),
    daRimborsare: { io: pending('io'), partner: pending('partner') },
  };
}

export interface BalancePoint {
  mese: MonthKey;
  entrate: Cents;
  uscite: Cents;
  saldo: Cents;
}

/**
 * Andamento del saldo del conto mese per mese, a partire dal saldo iniziale.
 * Entrano i versamenti segnati come eseguiti, escono le spese pagate dal conto e i rimborsi.
 */
export function balanceHistory(data: AppData, until: MonthKey): BalancePoint[] {
  const s = data.cointestato.impostazioni;
  const count = monthIndex(until) - monthIndex(s.meseSaldoIniziale) + 1;
  if (count <= 0) return [];
  let saldo = s.saldoIniziale;
  return lastMonths(until, count).map((mese) => {
    const mine = myContribution(data, mese);
    const partner = data.cointestato.piani[mese]?.versamentoPartner;
    const entrate = (mine.eseguito ? mine.importo : 0) + (partner?.eseguito ? partner.importo : 0);
    const uscite = sum(
      data.cointestato.movimenti.filter((t) => monthOfDate(t.data) === mese && leftTheAccount(t)),
      (t) => t.importo,
    );
    saldo += entrate - uscite;
    return { mese, entrate, uscite, saldo };
  });
}

export function currentBalance(data: AppData, month: MonthKey): Cents {
  const history = balanceHistory(data, month);
  return history.length ? history[history.length - 1]!.saldo : data.cointestato.impostazioni.saldoIniziale;
}

export function jointCategoryRows(data: AppData, month: MonthKey) {
  const joint = data.cointestato;
  return categoryRows(joint.piani[month], transactionsOfMonth(joint.movimenti, month), joint.categorie);
}

export interface JointPeriodStats {
  mesi: MonthKey[];
  speso: Cents;
  perCategoria: Record<ID, Cents>;
  /** Quanto delle spese comuni spetta a ciascuno secondo la regola di ripartizione. */
  carico: Record<Partner, Cents>;
  versato: Record<Partner, Cents>;
}

/** Statistiche delle spese comuni sui mesi con dati nel periodo. */
export function jointPeriodStats(data: AppData, end: MonthKey, count: number): JointPeriodStats {
  const joint = data.cointestato;
  const mesi = lastMonths(end, count).filter(
    (m) => joint.piani[m] || joint.movimenti.some((t) => monthOfDate(t.data) === m),
  );
  const set = new Set(mesi);
  const tx = joint.movimenti.filter((t) => set.has(monthOfDate(t.data)));
  const perCategoria: Record<ID, Cents> = {};
  for (const t of tx) perCategoria[t.categoriaId] = (perCategoria[t.categoriaId] ?? 0) + t.importo;
  const speso = sum(tx, (t) => t.importo);
  const share = myShare(joint.impostazioni);
  const versato = { io: 0, partner: 0 };
  for (const m of mesi) {
    const mine = myContribution(data, m);
    if (mine.eseguito) versato.io += mine.importo;
    const p = joint.piani[m]?.versamentoPartner;
    if (p?.eseguito) versato.partner += p.importo;
  }
  return {
    mesi,
    speso,
    perCategoria,
    carico: { io: Math.round(speso * share), partner: speso - Math.round(speso * share) },
    versato,
  };
}

/**
 * Fabbisogno medio mensile del conto secondo il modello: per ogni categoria il budget del modello
 * o, se più alto, il costo mensile equivalente delle spese ricorrenti (un affitto, una bolletta bimestrale…).
 */
export function averageJointNeed(data: AppData): Cents {
  const joint = data.cointestato;
  const recurring: Record<ID, Cents> = {};
  for (const r of joint.ricorrenze.filter((x) => x.attiva))
    recurring[r.categoriaId] = (recurring[r.categoriaId] ?? 0) + monthlyEquivalent(r);
  const ids = new Set([...Object.keys(joint.modelloBudget), ...Object.keys(recurring)]);
  return sum([...ids], (id) => Math.max(joint.modelloBudget[id] ?? 0, recurring[id] ?? 0));
}
