import { sum } from './money';
import { addMonths, monthIndex, monthOfDate, monthsBetween } from './month';
import type { Cents, Goal, GoalType, MonthKey } from './types';

export const goalTypeLabels: Record<GoalType, string> = {
  acquisto: 'Acquisto (es. auto nuova)',
  casa: 'Casa / anticipo mutuo',
  investimento: 'Investimenti',
  emergenza: 'Fondo emergenza',
  altro: 'Altro',
};

export function goalSaved(goal: Goal): Cents {
  return goal.saldoIniziale + sum(goal.versamenti, (v) => v.importo);
}

export function goalRemaining(goal: Goal): Cents {
  return Math.max(0, goal.target - goalSaved(goal));
}

/** Versamento medio mensile negli ultimi `months` mesi (mese corrente incluso). */
export function averageContribution(goal: Goal, now: MonthKey, months = 6): Cents {
  const from = monthIndex(now) - months + 1;
  const recent = goal.versamenti.filter((v) => {
    const i = monthIndex(monthOfDate(v.data));
    return i >= from && i <= monthIndex(now);
  });
  return Math.round(sum(recent, (v) => v.importo) / months);
}

export type GoalStatus = 'raggiunto' | 'in-linea' | 'in-ritardo' | 'scaduto' | 'senza-scadenza';

export interface GoalProjection {
  saved: Cents;
  remaining: Cents;
  progress: number;
  /** Mesi rimanenti alla scadenza (mese corrente incluso). */
  monthsLeft?: number;
  /** Quanto bisognerebbe versare ogni mese per rispettare la scadenza. */
  requiredMonthly?: Cents;
  /** Ritmo usato per la proiezione: contributo previsto o media storica. */
  pace: Cents;
  /** Mese stimato di raggiungimento al ritmo attuale. */
  eta?: MonthKey;
  status: GoalStatus;
}

export function projectGoal(goal: Goal, now: MonthKey): GoalProjection {
  const saved = goalSaved(goal);
  const remaining = Math.max(0, goal.target - saved);
  const progress = goal.target ? Math.min(100, Math.round((saved / goal.target) * 100)) : 0;
  const pace = goal.contributoMensile ?? averageContribution(goal, now);
  const eta = remaining === 0 ? now : pace > 0 ? addMonths(now, Math.ceil(remaining / pace) - 1) : undefined;

  if (remaining === 0) return { saved, remaining, progress, pace, eta, status: 'raggiunto' };
  if (!goal.scadenza) return { saved, remaining, progress, pace, eta, status: 'senza-scadenza' };

  const monthsLeft = monthsBetween(now, goal.scadenza) + 1;
  if (monthsLeft <= 0) return { saved, remaining, progress, pace, eta, monthsLeft, status: 'scaduto' };
  const requiredMonthly = Math.ceil(remaining / monthsLeft);
  const status = pace >= requiredMonthly ? 'in-linea' : 'in-ritardo';
  return { saved, remaining, progress, pace, eta, monthsLeft, requiredMonthly, status };
}

/** Obiettivo per un fondo emergenza: N mesi di spese essenziali. */
export function emergencyFundTarget(monthlyExpenses: Cents, months: number): Cents {
  return monthlyExpenses * months;
}

/**
 * Liquidità necessaria per l'acquisto di una casa:
 * anticipo (prezzo non coperto dal mutuo) + costi accessori (notaio, imposte, agenzia...).
 */
export function houseCashNeeded(price: Cents, anticipoPct: number, costiAccessoriPct: number): Cents {
  return Math.round(price * (anticipoPct / 100) + price * (costiAccessoriPct / 100));
}

/** Rata mensile di un mutuo a tasso fisso (ammortamento alla francese). */
export function mortgagePayment(principal: Cents, annualRatePct: number, years: number): Cents {
  const n = years * 12;
  if (n <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.round(principal / n);
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -n)));
}
