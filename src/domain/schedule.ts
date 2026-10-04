import { dateInMonth, dayNumber, dayOfMonth, daysInMonth, fromDayNumber, monthIndex, monthOfDate, weekday, weekdayNames } from './month';
import type { Cents, DateKey, MonthKey, Recurring, Schedule } from './types';

/** Frequenze proposte all'utente, dalla più fitta alla più rada. */
export const frequencyOptions: { key: string; label: string; ripetizione: Schedule }[] = [
  { key: 's1', label: 'Settimanale', ripetizione: { tipo: 'settimane', ogni: 1 } },
  { key: 's2', label: 'Ogni 2 settimane', ripetizione: { tipo: 'settimane', ogni: 2 } },
  { key: 's4', label: 'Ogni 4 settimane', ripetizione: { tipo: 'settimane', ogni: 4 } },
  { key: 'm1', label: 'Mensile', ripetizione: { tipo: 'mesi', ogni: 1 } },
  { key: 'm2', label: 'Bimestrale', ripetizione: { tipo: 'mesi', ogni: 2 } },
  { key: 'm3', label: 'Trimestrale', ripetizione: { tipo: 'mesi', ogni: 3 } },
  { key: 'm4', label: 'Quadrimestrale', ripetizione: { tipo: 'mesi', ogni: 4 } },
  { key: 'm6', label: 'Semestrale', ripetizione: { tipo: 'mesi', ogni: 6 } },
  { key: 'm12', label: 'Annuale', ripetizione: { tipo: 'mesi', ogni: 12 } },
];

export function frequencyKey(s: Schedule): string {
  return `${s.tipo === 'settimane' ? 's' : 'm'}${s.ogni}`;
}

/** "Ogni 2 settimane, il giovedì" · "Mensile, il giorno 5" */
export function scheduleLabel(r: Recurring): string {
  const base = frequencyOptions.find((o) => o.key === frequencyKey(r.ripetizione))?.label ?? `Ogni ${r.ripetizione.ogni} ${r.ripetizione.tipo}`;
  return r.ripetizione.tipo === 'settimane' ? `${base}, il ${weekdayNames[weekday(r.inizio)]}` : `${base}, il giorno ${dayOfMonth(r.inizio)}`;
}

/** Date in cui la ricorrenza cade nel mese indicato (anche più d'una, per quelle settimanali). */
export function occurrencesInMonth(r: Recurring, month: MonthKey): DateKey[] {
  if (!r.attiva) return [];
  const first = dayNumber(`${month}-01`);
  const last = dayNumber(`${month}-${String(daysInMonth(month)).padStart(2, '0')}`);
  const start = dayNumber(r.inizio);
  const end = r.fine ? dayNumber(r.fine) : Infinity;
  const ogni = Math.max(1, Math.round(r.ripetizione.ogni));

  if (r.ripetizione.tipo === 'settimane') {
    const step = ogni * 7;
    const from = Math.max(first, start);
    // Prima occorrenza ≥ from allineata al passo a partire dalla data iniziale.
    let n = start + Math.ceil((from - start) / step) * step;
    const result: DateKey[] = [];
    for (; n <= last && n <= end; n += step) result.push(fromDayNumber(n));
    return result;
  }

  const diff = monthIndex(month) - monthIndex(monthOfDate(r.inizio));
  if (diff < 0 || diff % ogni !== 0) return [];
  const date = dateInMonth(month, dayOfMonth(r.inizio));
  const n = dayNumber(date);
  return n >= start && n <= end ? [date] : [];
}

/** Costo medio mensile di una ricorrenza (es. 120 € annuali → 10 €/mese; 40 € a settimana → 173 €/mese). */
export function monthlyEquivalent(r: Recurring): Cents {
  const ogni = Math.max(1, r.ripetizione.ogni);
  return r.ripetizione.tipo === 'settimane' ? Math.round((r.importo * 52) / 12 / ogni) : Math.round(r.importo / ogni);
}
