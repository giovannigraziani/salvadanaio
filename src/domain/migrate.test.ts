import { describe, expect, it } from 'vitest';
import { balanceHistory, plannedContributions } from './ledger';
import { migrate } from './migrate';

/** Dati salvati con la versione 2 (un solo ledger personale + sezione cointestato). */
const v2 = {
  version: 2,
  settings: { nome: 'Giovanni', giornoStipendio: 27 },
  conti: [
    { id: 'cointestato', nome: 'Conto cointestato', tipo: 'cointestato' },
    { id: 'risparmio', nome: 'Conto risparmi', tipo: 'risparmio' },
  ],
  categorie: [{ id: 'svago', nome: 'Svago', tipo: 'discrezionale', colore: '#000' }],
  ricorrenze: [{ id: 'r', descrizione: 'Spotify', categoriaId: 'svago', importo: 1199, frequenza: 1, meseInizio: '2026-09', giorno: 5, attiva: true }],
  modello: { entrate: [{ descrizione: 'Stipendio', importo: 200000 }], trasferimenti: [{ descrizione: 'Cointestato', importo: 80000, contoId: 'cointestato' }], budget: { svago: 10000 } },
  piani: {
    '2026-10': {
      mese: '2026-10',
      entrate: [{ id: 'e', descrizione: 'Stipendio', importo: 200000 }],
      trasferimenti: [{ id: 't', descrizione: 'Cointestato', importo: 80000, contoId: 'cointestato', eseguito: true }],
      budget: { svago: 10000 },
      spesePreviste: [{ id: 'p', descrizione: 'Spotify', categoriaId: 'svago', importo: 1199, giorno: 5, ricorrenzaId: 'r' }],
    },
  },
  movimenti: [{ id: 'm', data: '2026-10-02', descrizione: 'Cena', categoriaId: 'svago', importo: 3000 }],
  obiettivi: [],
  cointestato: {
    impostazioni: { contoId: 'cointestato', nomePartner: 'Sara', regola: 'percentuale', redditoIo: 0, redditoPartner: 150000, percentualeIo: 60, arrotondamento: 1000, saldoIniziale: 40000, meseSaldoIniziale: '2026-10' },
    categorie: [{ id: 'c-spesa', nome: 'Spesa', tipo: 'essenziale', colore: '#111' }],
    ricorrenze: [],
    modelloBudget: { 'c-spesa': 50000 },
    piani: {
      '2026-10': { mese: '2026-10', budget: { 'c-spesa': 50000 }, spesePreviste: [], versamentoPartner: { importo: 60000, eseguito: true } },
    },
    movimenti: [
      { id: 'j1', data: '2026-10-03', descrizione: 'Spesa', categoriaId: 'c-spesa', importo: 9000, pagatoDa: 'conto' },
      { id: 'j2', data: '2026-10-04', descrizione: 'Farmacia', categoriaId: 'c-spesa', importo: 2000, pagatoDa: 'io' },
    ],
  },
};

describe('migrazione dalla versione 2', () => {
  const data = migrate(structuredClone(v2));

  it('crea un conto per me, uno per la partner, il cointestato e i risparmi', () => {
    expect(data.version).toBe(3);
    expect(data.conti.map((a) => [a.id, a.tipo])).toEqual([
      ['principale', 'personale'],
      ['partner', 'personale'],
      ['cointestato', 'cointestato'],
      ['risparmio', 'risparmio'],
    ]);
    expect(data.conti[1]!.titolare).toBe('Sara');
  });

  it('il mio conto conserva piano, spese e ricorrenze convertite', () => {
    const mio = data.conti[0]!;
    expect(mio.movimenti).toHaveLength(1);
    expect(mio.ricorrenze[0]!.ripetizione).toEqual({ tipo: 'mesi', ogni: 1 });
    expect(mio.ricorrenze[0]!.inizio).toBe('2026-09-05');
    expect(mio.piani['2026-10']!.spesePreviste[0]!.data).toBe('2026-10-05');
  });

  it('il cointestato riceve i versamenti di entrambi e conserva anticipi e saldo', () => {
    const comune = data.conti.find((a) => a.id === 'cointestato')!;
    expect(plannedContributions(data, comune, '2026-10')).toEqual({
      principale: { importo: 80000, eseguito: true, hasPlan: true },
      partner: { importo: 60000, eseguito: true, hasPlan: true },
    });
    expect(comune.ripartizione).toMatchObject({ regola: 'percentuale', percentuali: { principale: 60, partner: 40 } });
    expect(comune.movimenti.find((t) => t.id === 'j2')?.pagatoDa).toBe('principale');
    expect(comune.movimenti.find((t) => t.id === 'j1')?.pagatoDa).toBeUndefined();
    // 400 + 800 + 600 − 90
    expect(balanceHistory(data, comune, '2026-10', '2026-10-10').at(-1)!.saldo).toBe(40000 + 140000 - 9000);
  });

  it('rifiuta dati non validi o di versioni future', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate({ version: 99 })).toThrow();
  });

  it('i dati v1 senza cointestato non creano il conto della partner', () => {
    const { cointestato: _c, ...v1 } = structuredClone(v2);
    const d = migrate({ ...v1, version: 1 });
    expect(d.conti.map((a) => a.id)).toEqual(['principale', 'cointestato', 'risparmio']);
  });
});
