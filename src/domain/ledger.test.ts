import { describe, expect, it } from 'vitest';
import { budgetSuggestions, contributionRows, moneyFlow, rangeStats, savingsRate } from './analysis';
import { emptyData, newAccount } from './defaults';
import { demoData } from './demo';
import {
  averageNeed,
  balanceHistory,
  createPlan,
  incomingTransfers,
  missingRecurring,
  plannedContributions,
  shares,
  splitAmount,
  summarizePlan,
} from './ledger';
import { weekday } from './month';
import { monthlyEquivalent, occurrencesInMonth, scheduleLabel } from './schedule';
import type { AppData, Recurring } from './types';

describe('ricorrenze', () => {
  const monthly: Recurring = {
    id: 'r',
    descrizione: 'Visita',
    categoriaId: 'salute',
    importo: 8000,
    ripetizione: { tipo: 'mesi', ogni: 6 },
    inizio: '2026-03-15',
    attiva: true,
  };

  it('ogni N mesi nello stesso giorno', () => {
    expect(occurrencesInMonth(monthly, '2026-02')).toEqual([]);
    expect(occurrencesInMonth(monthly, '2026-03')).toEqual(['2026-03-15']);
    expect(occurrencesInMonth(monthly, '2026-06')).toEqual([]);
    expect(occurrencesInMonth(monthly, '2026-09')).toEqual(['2026-09-15']);
    expect(occurrencesInMonth({ ...monthly, fine: '2026-08-31' }, '2026-09')).toEqual([]);
    expect(occurrencesInMonth({ ...monthly, attiva: false }, '2026-03')).toEqual([]);
  });

  it('il giorno 31 diventa l’ultimo giorno dei mesi più corti', () => {
    const r = { ...monthly, ripetizione: { tipo: 'mesi' as const, ogni: 1 }, inizio: '2026-01-31' };
    expect(occurrencesInMonth(r, '2026-02')).toEqual(['2026-02-28']);
  });

  it('a settimane alterne il giovedì: due o tre volte al mese', () => {
    const r: Recurring = { ...monthly, ripetizione: { tipo: 'settimane', ogni: 2 }, inizio: '2026-10-01' };
    expect(weekday('2026-10-01')).toBe(4);
    expect(occurrencesInMonth(r, '2026-09')).toEqual([]);
    expect(occurrencesInMonth(r, '2026-10')).toEqual(['2026-10-01', '2026-10-15', '2026-10-29']);
    expect(occurrencesInMonth(r, '2026-11')).toEqual(['2026-11-12', '2026-11-26']);
    expect(occurrencesInMonth(r, '2026-12')).toEqual(['2026-12-10', '2026-12-24']);
    expect(scheduleLabel(r)).toBe('Ogni 2 settimane, il giovedì');
    expect(monthlyEquivalent({ ...r, importo: 4000 })).toBe(Math.round((4000 * 52) / 12 / 2));
  });

  it('settimanale attraverso il cambio dell’ora legale', () => {
    const r: Recurring = { ...monthly, ripetizione: { tipo: 'settimane', ogni: 1 }, inizio: '2026-10-20' };
    expect(occurrencesInMonth(r, '2026-10')).toEqual(['2026-10-20', '2026-10-27']);
    expect(occurrencesInMonth(r, '2026-11')).toEqual(['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']);
  });
});

describe('piano di un conto', () => {
  it('nasce dal modello, una spesa per occorrenza, budget che copre le previste', () => {
    const a = newAccount('personale', 'Mio');
    a.modello = { entrate: [{ descrizione: 'Stipendio', importo: 200000 }], trasferimenti: [], budget: { salute: 5000 } };
    a.ricorrenze = [{ id: 'f', descrizione: 'Fisio', categoriaId: 'salute', importo: 4000, ripetizione: { tipo: 'settimane', ogni: 2 }, inizio: '2026-10-01', attiva: true }];
    const plan = createPlan(a, '2026-10');
    expect(plan.spesePreviste.map((p) => p.data)).toEqual(['2026-10-01', '2026-10-15', '2026-10-29']);
    expect(plan.budget.salute).toBe(12000);
    // una nuova ricorrenza viene proposta, quelle presenti no
    a.ricorrenze.push({ ...a.ricorrenze[0]!, id: 'g', descrizione: 'Altro' });
    expect(missingRecurring(plan, a.ricorrenze)).toHaveLength(3);
    expect(missingRecurring(plan, a.ricorrenze).every((p) => p.ricorrenzaId === 'g')).toBe(true);
  });
});

function twoPeople(): AppData {
  const data = emptyData();
  const [mio, comune, risparmi] = data.conti as [any, any, any];
  const partner = newAccount('personale', 'Conto di Sara', { id: 'sara', titolare: 'Sara' });
  data.conti.splice(1, 0, partner);
  mio.modello.entrate = [{ descrizione: 'Stipendio', importo: 200000 }];
  mio.modello.trasferimenti = [
    { descrizione: 'Cointestato', importo: 80000, contoId: comune.id },
    { descrizione: 'Risparmi', importo: 30000, contoId: risparmi.id },
  ];
  partner.modello.entrate = [{ descrizione: 'Stipendio', importo: 100000 }];
  partner.modello.trasferimenti = [{ descrizione: 'Cointestato', importo: 40000, contoId: comune.id }];
  comune.ripartizione = { regola: 'proporzionale', partecipanti: [mio.id, partner.id], percentuali: {}, arrotondamento: 1000 };
  comune.modello.budget = { 'c-spesa': 30000 };
  comune.ricorrenze = [{ id: 'aff', descrizione: 'Affitto', categoriaId: 'c-casa', importo: 90000, ripetizione: { tipo: 'mesi', ogni: 1 }, inizio: '2026-01-01', attiva: true }];
  for (const a of data.conti) {
    a.meseSaldoIniziale = '2026-10';
    a.piani['2026-10'] = createPlan(a, '2026-10');
  }
  comune.saldoIniziale = 50000;
  return data;
}

describe('conti condivisi', () => {
  it('quote proporzionali alle entrate dei conti partecipanti', () => {
    const data = twoPeople();
    const comune = data.conti.find((a) => a.id === 'cointestato')!;
    expect(shares(data, comune)).toEqual({ principale: 2 / 3, sara: 1 / 3 });
    expect(averageNeed(comune)).toBe(120000);
    expect(splitAmount(data, comune, 120000)).toEqual({ principale: 80000, sara: 40000 });
    comune.ripartizione = { ...comune.ripartizione!, regola: 'percentuale', percentuali: { principale: 70, sara: 30 } };
    expect(splitAmount(data, comune, 100000)).toEqual({ principale: 70000, sara: 30000 });
    comune.ripartizione.regola = 'paritaria';
    expect(splitAmount(data, comune, 100000)).toEqual({ principale: 50000, sara: 50000 });
  });

  it('i versamenti degli altri conti arrivano sul conto condiviso', () => {
    const data = twoPeople();
    const comune = data.conti.find((a) => a.id === 'cointestato')!;
    expect(incomingTransfers(data, 'cointestato', '2026-10').map((i) => [i.from.id, i.line.importo])).toEqual([
      ['principale', 80000],
      ['sara', 40000],
    ]);
    const summary = summarizePlan(data, comune, '2026-10');
    expect(summary.inArrivo).toBe(120000);
    expect(summary.budget).toBe(120000);
    expect(summary.nonAllocato).toBe(0);
    expect(plannedContributions(data, comune, '2026-10').sara).toEqual({ importo: 40000, eseguito: false, hasPlan: true });
  });

  it('saldo: versamenti eseguiti, spese pagate, anticipi e rimborsi', () => {
    const data = twoPeople();
    const [mio, sara, comune] = data.conti as [any, any, any];
    for (const t of mio.piani['2026-10'].trasferimenti) t.eseguito = true;
    sara.piani['2026-10'].trasferimenti[0].eseguito = true;
    comune.movimenti = [
      { id: 'a', data: '2026-10-01', descrizione: 'Affitto', categoriaId: 'c-casa', importo: 90000 },
      { id: 'b', data: '2026-10-03', descrizione: 'Farmacia', categoriaId: 'c-salute', importo: 2500, pagatoDa: 'principale' },
      { id: 'c', data: '2026-10-04', descrizione: 'Mobili', categoriaId: 'c-manutenzione', importo: 12000, pagatoDa: 'sara', rimborsato: true },
    ];
    const at = (account: any, today: string) => balanceHistory(data, account, '2026-10', today).at(-1)!.saldo;
    // conto comune: 500 + 800 + 400 − 900 − 120 (rimborso) = 680; la farmacia anticipata non esce ancora
    expect(at(comune, '2026-10-10')).toBe(68000);
    // il mio conto prima dello stipendio: −800 −300 −25 (anticipo)
    expect(at(mio, '2026-10-10')).toBe(-80000 - 30000 - 2500);
    // dopo lo stipendio (giorno 27)
    expect(at(mio, '2026-10-28')).toBe(200000 - 110000 - 2500);
    // Sara ha anticipato 120 € e le sono stati restituiti
    expect(at(sara, '2026-10-28')).toBe(100000 - 40000);
    expect(summarizePlan(data, comune, '2026-10').daRimborsare).toBe(2500);
  });
});

describe('analisi sui dati di esempio', () => {
  const data = demoData('2026-10', 4);
  const mio = data.conti[0]!;
  const comune = data.conti.find((a) => a.id === 'cointestato')!;

  it('considera solo i mesi con dati', () => {
    expect(rangeStats(data, mio, '2026-10', 12).map((s) => s.mese)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('tasso di risparmio e flusso delle entrate per destinazione', () => {
    const stats = rangeStats(data, mio, '2026-09', 3);
    // risparmi 300 + obiettivi 250 su 2100 di entrate
    expect(savingsRate(data, stats)).toBe(26);
    const flow = moneyFlow(data, stats, mio.categorie);
    expect(flow.entrate).toBe(3 * 210000);
    expect(flow.slices.find((s) => s.key === 'conto:risparmio')?.value).toBe(3 * 30000);
    expect(flow.slices.find((s) => s.key === 'obiettivo:auto')?.label).toBe('Obiettivo Auto nuova');
  });

  it('suggerimenti: svago sottostimato, assicurazione trimestrale spalmata', () => {
    const suggestions = budgetSuggestions(data, mio, '2026-09', 3);
    expect(suggestions.find((s) => s.categoria.id === 'svago')?.kind).toBe('aumenta');
    // l'assicurazione trimestrale da 95 € pesa 31,67 € al mese (non 95 € in un mese e 0 negli altri), più 120 € di carburante
    const trasporti = suggestions.find((s) => s.categoria.id === 'trasporti');
    if (trasporti) expect(trasporti.ricorrenti).toBe(3167);
  });

  it('le quote del cointestato seguono la regola e i conti sono coerenti', () => {
    for (const m of ['2026-07', '2026-08', '2026-09']) {
      const c = plannedContributions(data, comune, m);
      expect(c.principale!.eseguito && c.partner!.eseguito).toBe(true);
      expect(summarizePlan(data, comune, m).inArrivo).toBeGreaterThanOrEqual(summarizePlan(data, comune, m).budget);
    }
    const rows = contributionRows(data, comune, rangeStats(data, comune, '2026-09', 3));
    expect(rows.map((r) => r.conto.id)).toEqual(['principale', 'partner']);
    expect(balanceHistory(data, comune, '2026-10', '2026-10-04').every((h) => h.saldo > 0)).toBe(true);
  });

  it('la fisioterapia a settimane alterne compare nel piano del mese giusto numero di volte', () => {
    for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) {
      const n = mio.piani[m]!.spesePreviste.filter((p) => p.ricorrenzaId === 'r-fisioterapia').length;
      expect([2, 3]).toContain(n);
    }
  });
});

describe('suggerimenti e ricorrenze', () => {
  it('nessun suggerimento per una categoria coperta solo da ricorrenze', () => {
    const data = demoData('2026-10', 4);
    const comune = data.conti.find((a) => a.id === 'cointestato')!;
    const s = budgetSuggestions(data, comune, '2026-09', 3);
    expect(s.find((x) => x.categoria.id === 'c-casa')).toBeUndefined();
  });
});

describe('suggerimenti e voci a consumo', () => {
  it('quello che si spende su una voce a consumo conta come spesa variabile', () => {
    const data = demoData('2026-10', 4);
    const mio = data.conti[0]!;
    // tetto del carburante molto più basso dei pieni reali
    mio.ricorrenze = mio.ricorrenze.map((r) => (r.id === 'r-carburante' ? { ...r, importo: 2000 } : r));
    mio.modello.budget.trasporti = 2000;
    const s = budgetSuggestions(data, mio, '2026-09', 3).find((x) => x.categoria.id === 'trasporti')!;
    expect(s.kind).toBe('aumenta');
    expect(s.ricorrenti).toBe(3167);
    expect(s.mediaEstemporanea).toBeGreaterThan(10000);
  });
});
