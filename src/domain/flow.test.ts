import { describe, expect, it } from 'vitest';
import { demoData } from './demo';
import { salaryFlow } from './flow';
import { accountsOf, consumed, myName, paidPart, people, sharedWith, summarizePlan, investmentSummary, recurringForMonth } from './ledger';
import { sum } from './money';
import type { Recurring } from './types';

const data = demoData('2026-10', 4);

describe('persone', () => {
  it('ogni conto non condiviso ha un titolare, io per primo', () => {
    expect(myName(data)).toBe('Giovanni');
    expect(people(data)).toEqual(['Giovanni', 'Giulia']);
    expect(accountsOf(data, 'Giovanni').map((a) => a.id)).toEqual(['principale', 'risparmio', 'titoli']);
    expect(accountsOf(data, 'Giulia').map((a) => a.id)).toEqual(['partner']);
    expect(sharedWith(data, 'Giulia').map((a) => a.id)).toEqual(['cointestato']);
  });
});

describe('spese a consumo', () => {
  const base: Recurring = { id: 'c', descrizione: 'Carburante', categoriaId: 'trasporti', importo: 12000, ripetizione: { tipo: 'mesi', ogni: 1 }, inizio: '2026-01-01', attiva: true, aConsumo: true };

  it('diventano una voce senza data; quelle settimanali sommano le occorrenze del mese', () => {
    expect(recurringForMonth([base], '2026-10')).toMatchObject([{ descrizione: 'Carburante', importo: 12000, aConsumo: true, data: undefined }]);
    const spesa = { ...base, importo: 8000, ripetizione: { tipo: 'settimane' as const, ogni: 1 }, inizio: '2026-10-01' };
    // 5 giovedì a ottobre 2026
    expect(recurringForMonth([spesa], '2026-10')[0]!.importo).toBe(40000);
  });

  it('i pieni del mese riempiono la voce fino al suo importo', () => {
    const mio = data.conti[0]!;
    const fuel = mio.piani['2026-09']!.spesePreviste.find((p) => p.ricorrenzaId === 'r-carburante')!;
    expect(fuel.aConsumo).toBe(true);
    const spent = consumed(mio, fuel.id);
    expect(mio.movimenti.filter((t) => t.previstaId === fuel.id)).toHaveLength(3);
    expect(paidPart(mio, fuel)).toBe(Math.min(fuel.importo, spent));
    // nel mese in corso (giorno 4) un solo pieno
    const octFuel = mio.piani['2026-10']!.spesePreviste.find((p) => p.ricorrenzaId === 'r-carburante')!;
    expect(mio.movimenti.filter((t) => t.previstaId === octFuel.id)).toHaveLength(0);
    expect(summarizePlan(data, mio, '2026-10').previsteDaPagare).toBeGreaterThanOrEqual(octFuel.importo);
  });
});

describe('stipendio al 100%', () => {
  it('teorico: le destinazioni sommano lo stipendio', () => {
    const flow = salaryFlow(data, 'Giovanni', '2026-10', 'teorico');
    expect(flow.entrate).toBe(210000);
    expect(flow.eccesso).toBe(0);
    expect(sum(flow.nodes, (n) => n.value)).toBe(210000);
    expect(flow.nodes.map((n) => n.kind)).toEqual(['cointestato', 'risparmio', 'obiettivo', 'obiettivo', 'spese', 'libero']);
    const comune = flow.nodes[0]!;
    // i figli del cointestato sono la mia parte del budget comune, e non superano la quota
    expect(sum(comune.children, (c) => c.value)).toBe(comune.value);
    expect(comune.children.find((c) => c.label === 'Affitto o mutuo')!.value).toBe(Math.round(75000 * (2100 / 3900)));
  });

  it('effettivo: solo quote versate e spese registrate', () => {
    const flow = salaryFlow(data, 'Giovanni', '2026-09', 'effettivo');
    expect(flow.nodes.find((n) => n.kind === 'cointestato')!.value).toBeGreaterThan(0);
    const spese = flow.nodes.find((n) => n.kind === 'spese')!;
    expect(spese.value).toBe(sum(data.conti[0]!.movimenti.filter((t) => t.data.startsWith('2026-09')), (t) => t.importo));
    // a inizio ottobre lo stipendio non è ancora stato ripartito
    expect(salaryFlow(data, 'Giovanni', '2026-10', 'effettivo').nodes.some((n) => n.kind === 'cointestato')).toBe(false);
  });

  it('funziona per ogni persona', () => {
    const flow = salaryFlow(data, 'Giulia', '2026-09', 'teorico');
    expect(flow.entrate).toBe(180000);
    expect(flow.nodes[0]!.label).toBe('Conto cointestato');
  });
});

describe('investimenti', () => {
  it('rendimento: ultimo valore di mercato meno quanto versato', () => {
    const titoli = data.conti.find((a) => a.id === 'titoli')!;
    const s = investmentSummary(data, titoli, '2026-10', '2026-10-04');
    expect(s.valore).toBe(158000);
    expect(s.versato).toBe(120000 + 3 * 10000);
    expect(s.rendimento).toBe(158000 - 150000);
  });
});
