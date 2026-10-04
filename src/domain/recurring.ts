import { monthIndex, monthsBetween } from './month';
import type { Cents, Frequency, MonthKey, Recurring } from './types';

export const frequencyLabels: Record<Frequency, string> = {
  1: 'Mensile',
  2: 'Bimestrale',
  3: 'Trimestrale',
  4: 'Quadrimestrale',
  6: 'Semestrale',
  12: 'Annuale',
};

/** true se la ricorrenza produce una spesa nel mese indicato. */
export function occursIn(r: Recurring, month: MonthKey): boolean {
  if (!r.attiva) return false;
  if (monthIndex(month) < monthIndex(r.meseInizio)) return false;
  if (r.meseFine && monthIndex(month) > monthIndex(r.meseFine)) return false;
  return monthsBetween(r.meseInizio, month) % r.frequenza === 0;
}

/** Costo medio mensile di una ricorrenza (es. 120 € annuali -> 10 €/mese). */
export function monthlyEquivalent(r: Recurring): Cents {
  return Math.round(r.importo / r.frequenza);
}
