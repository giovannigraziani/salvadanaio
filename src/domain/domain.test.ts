import { describe, expect, it } from 'vitest';
import { houseCashNeeded, mortgagePayment, projectGoal } from './goals';
import { centsToInput, parseEuro } from './money';
import { addMonths, lastMonths, monthLabel } from './month';
import type { Goal } from './types';

describe('money', () => {
  it.each([
    ['12,50', 1250],
    ['12.50', 1250],
    ['1.200', 120000],
    ['1.200,75', 120075],
    ['1,200.75', 120075],
    ['€ 30', 3000],
    ['0,5', 50],
    ['-4', -400],
  ])('parseEuro(%s) = %i', (input, expected) => {
    expect(parseEuro(input)).toBe(expected);
  });

  it('rifiuta testo non numerico', () => {
    expect(parseEuro('abc')).toBeNull();
    expect(parseEuro('')).toBeNull();
    expect(parseEuro('1,234,5')).toBeNull();
  });

  it('converte i centesimi in testo per input', () => {
    expect(centsToInput(1250)).toBe('12,50');
    expect(centsToInput(3000)).toBe('30');
  });
});

describe('month', () => {
  it('gestisce il cambio di anno', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(monthLabel('2026-10')).toBe('Ottobre 2026');
  });
});

describe('obiettivi', () => {
  const goal: Goal = {
    id: 'g',
    nome: 'Auto',
    tipo: 'acquisto',
    target: 1000000,
    scadenza: '2027-09',
    saldoIniziale: 400000,
    versamenti: [{ id: 'v', data: '2026-09-27', importo: 50000 }],
    priorita: 2,
  };

  it('calcola quanto versare al mese per rispettare la scadenza', () => {
    const p = projectGoal(goal, '2026-10');
    expect(p.saved).toBe(450000);
    expect(p.monthsLeft).toBe(12);
    expect(p.requiredMonthly).toBe(Math.ceil(550000 / 12));
  });

  it('stima la data di raggiungimento in base al contributo previsto', () => {
    const p = projectGoal({ ...goal, contributoMensile: 55000 }, '2026-10');
    expect(p.eta).toBe('2027-07');
    expect(p.status).toBe('in-linea');
    expect(projectGoal({ ...goal, contributoMensile: 10000 }, '2026-10').status).toBe('in-ritardo');
  });

  it('riconosce un obiettivo raggiunto', () => {
    expect(projectGoal({ ...goal, saldoIniziale: 1000000 }, '2026-10').status).toBe('raggiunto');
  });

  it('calcola liquidità per la casa e rata del mutuo', () => {
    expect(houseCashNeeded(25000000, 20, 5)).toBe(6250000);
    // 200.000 € al 3% per 25 anni ≈ 948,42 €
    expect(mortgagePayment(20000000, 3, 25)).toBe(94842);
  });
});
