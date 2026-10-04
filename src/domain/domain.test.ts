import { describe, expect, it } from 'vitest';
import { budgetSuggestions, moneyFlow, rangeStats, savingsRate } from './analysis';
import { emptyData } from './defaults';
import { demoData } from './demo';
import { houseCashNeeded, mortgagePayment, projectGoal } from './goals';
import { centsToInput, parseEuro } from './money';
import { addMonths, lastMonths, monthLabel } from './month';
import { createPlan, missingRecurring, summarizePlan } from './plan';
import { occursIn } from './recurring';
import type { Goal, Recurring } from './types';

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

describe('ricorrenze', () => {
  const base: Recurring = {
    id: 'r',
    descrizione: 'Visita',
    categoriaId: 'salute',
    importo: 8000,
    frequenza: 6,
    meseInizio: '2026-03',
    attiva: true,
  };

  it('si ripete ogni N mesi a partire dal mese di inizio', () => {
    expect(occursIn(base, '2026-02')).toBe(false);
    expect(occursIn(base, '2026-03')).toBe(true);
    expect(occursIn(base, '2026-06')).toBe(false);
    expect(occursIn(base, '2026-09')).toBe(true);
    expect(occursIn(base, '2027-03')).toBe(true);
  });

  it('rispetta mese di fine e stato attivo', () => {
    expect(occursIn({ ...base, meseFine: '2026-08' }, '2026-09')).toBe(false);
    expect(occursIn({ ...base, attiva: false }, '2026-03')).toBe(false);
  });
});

describe('piano mensile', () => {
  it('nasce dal modello e include le ricorrenze del mese', () => {
    const data = emptyData();
    data.modello.entrate = [{ descrizione: 'Stipendio', importo: 200000 }];
    data.modello.trasferimenti = [{ descrizione: 'Cointestato', importo: 80000, contoId: 'cointestato' }];
    data.modello.budget = { svago: 15000 };
    data.ricorrenze = [
      { id: 'a', descrizione: 'Spotify', categoriaId: 'abbonamenti', importo: 1199, frequenza: 1, meseInizio: '2026-01', attiva: true },
      { id: 'b', descrizione: 'Assicurazione', categoriaId: 'trasporti', importo: 30000, frequenza: 12, meseInizio: '2026-05', attiva: true },
    ];
    const plan = createPlan(data, '2026-10');
    expect(plan.spesePreviste.map((p) => p.ricorrenzaId)).toEqual(['a']);
    const summary = summarizePlan(plan, [
      { id: 't1', data: '2026-10-03', descrizione: 'Cena', categoriaId: 'svago', importo: 4000 },
    ]);
    expect(summary.nonAllocato).toBe(200000 - 80000 - 15000);
    expect(summary.speso).toBe(4000);
    expect(summary.spesoEstemporaneo).toBe(4000);
    expect(summary.residuo).toBe(11000);

    // Una ricorrenza aggiunta dopo viene proposta, una già presente no.
    data.ricorrenze.push({ ...data.ricorrenze[0]!, id: 'c', descrizione: 'Netflix' });
    expect(missingRecurring(plan, data.ricorrenze).map((p) => p.ricorrenzaId)).toEqual(['c']);
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

describe('analisi', () => {
  const data = demoData('2026-10', 4);

  it('considera solo i mesi con dati', () => {
    expect(rangeStats(data, '2026-10', 12).map((s) => s.mese)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('calcola tasso di risparmio e flusso delle entrate', () => {
    const stats = rangeStats(data, '2026-09', 3);
    // risparmi 300 + obiettivi 250 su 2100 di entrate
    expect(savingsRate(stats)).toBe(26);
    const flow = moneyFlow(stats, data.categorie);
    expect(flow.entrate).toBe(3 * 210000);
    const versatoCointestato = stats.reduce((acc, s) => acc + (data.piani[s.mese]?.trasferimenti[0]?.importo ?? 0), 0);
    expect(flow.slices.find((s) => s.key === 'cointestato')?.value).toBe(versatoCointestato);
    // La categoria "altro" non deve confondersi con i trasferimenti "altro".
    expect(flow.slices.find((s) => s.key === 'altro')).toBeUndefined();
  });

  it('ripartisce le ricorrenze non mensili sul mese invece di usare la media grezza', () => {
    const suggestions = budgetSuggestions(data, '2026-09', 3);
    // Spotify 11,99 + telefono 9,99 + cloud annuale 29,99 / 12
    expect(suggestions.find((s) => s.categoria.id === 'abbonamenti')?.ricorrenti).toBe(1199 + 999 + 250);
    // L'assicurazione trimestrale (95 €) vale 31,67 €/mese: il budget trasporti risulta adeguato.
    expect(suggestions.find((s) => s.categoria.id === 'trasporti')).toBeUndefined();
  });

  it('suggerisce di aumentare il budget delle categorie sforate', () => {
    const suggestions = budgetSuggestions(data, '2026-09', 3);
    expect(suggestions.find((s) => s.categoria.id === 'svago')?.kind).toBe('aumenta');
  });
});
