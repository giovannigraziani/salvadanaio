import { describe, expect, it } from 'vitest';
import { emptyData } from './defaults';
import { averageJointNeed, balanceHistory, createJointPlan, jointMonthSummary, myContribution, myShare, splitAmount } from './joint';
import { createPlan } from './plan';
import type { AppData, JointSettings } from './types';

const settings = (patch: Partial<JointSettings>): JointSettings => ({ ...emptyData().cointestato.impostazioni, ...patch });

describe('ripartizione delle spese comuni', () => {
  it('a metà', () => {
    expect(splitAmount(settings({ regola: 'paritaria', arrotondamento: 1 }), 150000)).toEqual({ io: 75000, partner: 75000 });
  });

  it('in proporzione allo stipendio, arrotondando a 10 €', () => {
    const s = settings({ regola: 'proporzionale', redditoIo: 210000, redditoPartner: 140000, arrotondamento: 1000 });
    expect(myShare(s)).toBeCloseTo(0.6);
    expect(splitAmount(s, 150000)).toEqual({ io: 90000, partner: 60000 });
    expect(splitAmount(s, 155500)).toEqual({ io: 94000, partner: 63000 });
  });

  it('percentuale fissa', () => {
    expect(splitAmount(settings({ regola: 'percentuale', percentualeIo: 70, arrotondamento: 1 }), 100000)).toEqual({ io: 70000, partner: 30000 });
  });

  it('senza redditi la proporzionale torna a metà', () => {
    expect(myShare(settings({ regola: 'proporzionale', redditoIo: 0, redditoPartner: 0 }))).toBe(0.5);
  });
});

function sample(): AppData {
  const data = emptyData();
  data.cointestato.impostazioni = settings({ regola: 'paritaria', arrotondamento: 1, saldoIniziale: 50000, meseSaldoIniziale: '2026-09', contoId: 'cointestato' });
  data.cointestato.modelloBudget = { 'c-spesa': 40000, 'c-bollette': 5000 };
  data.cointestato.ricorrenze = [
    { id: 'affitto', descrizione: 'Affitto', categoriaId: 'c-casa', importo: 80000, frequenza: 1, meseInizio: '2026-01', attiva: true },
    { id: 'luce', descrizione: 'Luce e gas', categoriaId: 'c-bollette', importo: 14000, frequenza: 2, meseInizio: '2026-02', attiva: true },
  ];
  data.modello.trasferimenti = [{ descrizione: 'Cointestato', importo: 70000, contoId: 'cointestato' }];
  return data;
}

describe('piano del conto cointestato', () => {
  it('include le ricorrenze e alza il budget per coprirle', () => {
    const data = sample();
    const plan = createJointPlan(data, '2026-10');
    expect(plan.spesePreviste.map((p) => p.ricorrenzaId)).toEqual(['affitto', 'luce']);
    expect(plan.budget).toEqual({ 'c-spesa': 40000, 'c-bollette': 14000, 'c-casa': 80000 });
    // fabbisogno 1.340 € diviso a metà
    expect(plan.versamentoPartner).toEqual({ importo: 67000, eseguito: false });
  });

  it('il mio versamento viene dal piano personale', () => {
    const data = sample();
    expect(myContribution(data, '2026-10').hasPlan).toBe(false);
    data.piani['2026-10'] = createPlan(data, '2026-10');
    data.piani['2026-10'].trasferimenti[0]!.eseguito = true;
    expect(myContribution(data, '2026-10')).toMatchObject({ importo: 70000, eseguito: true });
  });
});

describe('fabbisogno medio', () => {
  it('somma budget del modello e costo mensile delle ricorrenze, senza contarli due volte', () => {
    // spesa 400 + bollette max(50, 140/2 = 70) + affitto 800
    expect(averageJointNeed(sample())).toBe(40000 + 7000 + 80000);
  });
});

describe('saldo e rimborsi', () => {
  it('somma i versamenti eseguiti e sottrae le spese uscite dal conto', () => {
    const data = sample();
    for (const m of ['2026-09', '2026-10']) {
      data.piani[m] = createPlan(data, m);
      data.piani[m].trasferimenti[0]!.eseguito = true;
      data.cointestato.piani[m] = createJointPlan(data, m);
      data.cointestato.piani[m].versamentoPartner = { importo: 60000, eseguito: m === '2026-09' };
    }
    data.cointestato.movimenti = [
      { id: 'a', data: '2026-09-05', descrizione: 'Affitto', categoriaId: 'c-casa', importo: 80000, pagatoDa: 'conto' },
      { id: 'b', data: '2026-10-03', descrizione: 'Spesa', categoriaId: 'c-spesa', importo: 9000, pagatoDa: 'conto' },
      // anticipata da me e non ancora rimborsata: non esce dal conto
      { id: 'c', data: '2026-10-04', descrizione: 'Farmacia', categoriaId: 'c-salute', importo: 2500, pagatoDa: 'io' },
      // anticipata dalla partner e già rimborsata: esce dal conto
      { id: 'd', data: '2026-10-04', descrizione: 'Mobili', categoriaId: 'c-manutenzione', importo: 12000, pagatoDa: 'partner', rimborsato: true },
    ];
    const history = balanceHistory(data, '2026-10');
    expect(history.map((h) => h.saldo)).toEqual([50000 + 70000 + 60000 - 80000, 100000 + 70000 - 9000 - 12000]);

    const summary = jointMonthSummary(data, '2026-10');
    expect(summary.speso).toBe(9000 + 2500 + 12000);
    expect(summary.daRimborsare).toEqual({ io: 2500, partner: 0 });
    expect(summary.versato).toBe(70000);
  });

  it('nessuno storico prima del mese del saldo iniziale', () => {
    expect(balanceHistory(sample(), '2026-08')).toEqual([]);
  });
});

describe('dati di esempio del conto cointestato', () => {
  it('le quote seguono la regola e il saldo resta positivo', async () => {
    const { demoData } = await import('./demo');
    const data = demoData('2026-10', 4);
    for (const m of ['2026-07', '2026-08', '2026-09']) {
      const summary = jointMonthSummary(data, m);
      expect(summary.versamenti.io.importo).toBe(summary.quote.io);
      expect(summary.versamenti.partner).toEqual({ importo: summary.quote.partner, eseguito: true });
    }
    expect(balanceHistory(data, '2026-10').every((h) => h.saldo > 0)).toBe(true);
    expect(jointMonthSummary(data, '2026-10').daRimborsare.io).toBe(3990);
  });
});
