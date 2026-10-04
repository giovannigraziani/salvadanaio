import type { DateKey, MonthKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toMonthKey(date: Date): MonthKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function toDateKey(date: Date): DateKey {
  return `${toMonthKey(date)}-${pad(date.getDate())}`;
}

export function currentMonth(): MonthKey {
  return toMonthKey(new Date());
}

export function today(): DateKey {
  return toDateKey(new Date());
}

export function parseMonth(month: MonthKey): { year: number; month: number } {
  const [y, m] = month.split('-').map(Number);
  return { year: y!, month: m! };
}

/** Numero progressivo del mese, utile per differenze tra mesi. */
export function monthIndex(month: MonthKey): number {
  const { year, month: m } = parseMonth(month);
  return year * 12 + (m - 1);
}

export function fromMonthIndex(index: number): MonthKey {
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  return fromMonthIndex(monthIndex(month) + delta);
}

export function monthsBetween(from: MonthKey, to: MonthKey): number {
  return monthIndex(to) - monthIndex(from);
}

/** Gli ultimi `count` mesi fino a `end` incluso, in ordine cronologico. */
export function lastMonths(end: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - count + 1));
}

export function monthOfDate(date: DateKey): MonthKey {
  return date.slice(0, 7);
}

export function daysInMonth(month: MonthKey): number {
  const { year, month: m } = parseMonth(month);
  return new Date(year, m, 0).getDate();
}

/** Data del mese con il giorno indicato, limitato all'ultimo giorno disponibile. */
export function dateInMonth(month: MonthKey, day: number): DateKey {
  return `${month}-${pad(Math.min(Math.max(1, day), daysInMonth(month)))}`;
}

const monthNames = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/** "2026-10" -> "Ottobre 2026" */
export function monthLabel(month: MonthKey): string {
  const { year, month: m } = parseMonth(month);
  const name = monthNames[m - 1]!;
  return `${name[0]!.toUpperCase()}${name.slice(1)} ${year}`;
}

/** "2026-10" -> "ott 26" */
export function monthShortLabel(month: MonthKey): string {
  const { year, month: m } = parseMonth(month);
  return `${monthNames[m - 1]!.slice(0, 3)} ${String(year).slice(2)}`;
}

/** "2026-10-04" -> "4 ott" */
export function dateLabel(date: DateKey): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${monthNames[m! - 1]!.slice(0, 3)}`;
}

export function isValidMonth(value: string): value is MonthKey {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
