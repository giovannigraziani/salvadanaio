import type { Cents } from './types';

const formatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const compactFormatter = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** 123456 -> "1.234,56 €" */
export function formatEuro(cents: Cents): string {
  return formatter.format(cents / 100);
}

/** 123456 -> "1.235 €" (senza decimali, per grafici e riepiloghi). */
export function formatEuroShort(cents: Cents): string {
  return compactFormatter.format(Math.round(cents / 100));
}

/**
 * Interpreta un importo scritto dall'utente ("12,50", "1.200", "1200.5", "€ 30")
 * e lo restituisce in centesimi. Restituisce null se il testo non è un numero valido.
 */
export function parseEuro(input: string): Cents | null {
  let s = input.replace(/[€\s]/g, '');
  if (s === '') return null;
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Il separatore più a destra è quello decimale; l'altro è delle migliaia.
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    s = s.replace(',', '.');
  } else if (lastDot >= 0) {
    // "1.200" con tre cifre dopo il punto e un solo punto è più probabilmente un separatore di migliaia
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1]!.length === 3)) s = parts.join('');
  }
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return negative ? -cents : cents;
}

/** Centesimi -> testo per un campo di input ("12,50"). */
export function centsToInput(cents: Cents): string {
  if (!cents) return '';
  return (cents / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');
}

export function sum<T>(items: readonly T[], get: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += get(item);
  return total;
}

/** Percentuale 0-100 arrotondata, sicura con denominatore 0. */
export function percent(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}
