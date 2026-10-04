import { emptyData } from './defaults';
import { addMonths, dateInMonth, daysInMonth } from './month';
import { createPlan } from './plan';
import type { AppData, MonthKey, Transaction } from './types';

/** Generatore pseudo-casuale deterministico: i dati di esempio sono sempre gli stessi. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const euro = (n: number) => Math.round(n * 100);

/** Dati di esempio: tre mesi passati completi e il mese corrente in corso. */
export function demoData(now: MonthKey, todayDay: number): AppData {
  const data = emptyData();
  const random = rng(42);
  const start = addMonths(now, -3);

  data.settings.nome = 'Demo';
  data.settings.datiDiEsempio = true;
  data.conti.push({ id: 'investimenti', nome: 'Conto titoli', tipo: 'investimenti' });
  data.modello = {
    entrate: [{ descrizione: 'Stipendio', importo: euro(2100) }],
    trasferimenti: [
      { descrizione: 'Versamento conto cointestato', importo: euro(850), contoId: 'cointestato' },
      { descrizione: 'Versamento risparmi', importo: euro(300), contoId: 'risparmio' },
      { descrizione: 'Accantonamento auto nuova', importo: euro(150), obiettivoId: 'auto' },
      { descrizione: 'PAC ETF', importo: euro(100), obiettivoId: 'pac' },
    ],
    budget: {
      abbonamenti: euro(45),
      salute: euro(60),
      trasporti: euro(180),
      svago: euro(150),
      abbigliamento: euro(80),
      cura: euro(70),
      regali: euro(40),
      altro: euro(50),
    },
  };

  data.ricorrenze = [
    { id: 'r-spotify', descrizione: 'Spotify', categoriaId: 'abbonamenti', importo: euro(11.99), frequenza: 1, meseInizio: start, giorno: 5, attiva: true },
    { id: 'r-telefono', descrizione: 'Telefono', categoriaId: 'abbonamenti', importo: euro(9.99), frequenza: 1, meseInizio: start, giorno: 12, attiva: true },
    { id: 'r-palestra', descrizione: 'Palestra', categoriaId: 'cura', importo: euro(45), frequenza: 1, meseInizio: start, giorno: 1, attiva: true },
    { id: 'r-cloud', descrizione: 'Archiviazione cloud', categoriaId: 'abbonamenti', importo: euro(29.99), frequenza: 12, meseInizio: addMonths(now, -2), giorno: 18, attiva: true },
    { id: 'r-dentista', descrizione: 'Pulizia denti', categoriaId: 'salute', importo: euro(80), frequenza: 6, meseInizio: addMonths(now, -1), giorno: 20, attiva: true },
    { id: 'r-assicurazione', descrizione: 'Rata assicurazione auto', categoriaId: 'trasporti', importo: euro(95), frequenza: 3, meseInizio: start, giorno: 10, attiva: true },
  ];

  data.obiettivi = [
    { id: 'auto', nome: 'Auto nuova', tipo: 'acquisto', target: euro(8000), scadenza: addMonths(now, 30), contributoMensile: euro(150), saldoIniziale: euro(2400), versamenti: [], contoId: 'risparmio', priorita: 2 },
    { id: 'casa', nome: 'Anticipo prima casa', tipo: 'casa', target: euro(45000), scadenza: addMonths(now, 60), saldoIniziale: euro(9500), versamenti: [], contoId: 'risparmio', priorita: 1 },
    { id: 'emergenza', nome: 'Fondo emergenza', tipo: 'emergenza', target: euro(6000), saldoIniziale: euro(6000), versamenti: [], contoId: 'risparmio', priorita: 1 },
    { id: 'pac', nome: 'PAC ETF azionario globale', tipo: 'investimento', target: euro(20000), contributoMensile: euro(100), saldoIniziale: euro(1200), versamenti: [], contoId: 'investimenti', priorita: 3 },
  ];

  const extra: Record<string, [string, number, number][]> = {
    trasporti: [['Benzina', 45, 70], ['Benzina', 40, 65], ['Parcheggio', 3, 12], ['Treno', 8, 25]],
    svago: [['Aperitivo', 12, 25], ['Cena fuori', 30, 55], ['Cinema', 9, 18], ['Concerto', 35, 60], ['Pizza con amici', 15, 25]],
    abbigliamento: [['Scarpe', 60, 110], ['Maglione', 30, 60]],
    cura: [['Barbiere', 18, 25], ['Integratori', 15, 30]],
    regali: [['Regalo compleanno', 25, 50]],
    altro: [['Libri', 12, 30], ['Elettronica', 20, 80], ['Casa (personale)', 10, 40]],
    salute: [['Farmacia', 8, 25]],
  };

  for (let i = 0; i <= 3; i++) {
    const month = addMonths(start, i);
    const isCurrent = month === now;
    const lastDay = isCurrent ? todayDay : daysInMonth(month);
    const plan = createPlan(data, month);
    data.piani[month] = plan;

    // Trasferimenti eseguiti il giorno dello stipendio (nel mese corrente solo se è già arrivato).
    for (const t of plan.trasferimenti) {
      if (isCurrent && todayDay < data.settings.giornoStipendio) continue;
      t.eseguito = true;
      if (t.obiettivoId) {
        const goal = data.obiettivi.find((g) => g.id === t.obiettivoId)!;
        const v = { id: `v-${month}-${goal.id}`, data: dateInMonth(month, data.settings.giornoStipendio), importo: t.importo };
        goal.versamenti.push(v);
        t.versamentoId = v.id;
      }
    }

    // Spese previste pagate (nel mese corrente solo quelle già scadute).
    for (const p of plan.spesePreviste) {
      const day = p.giorno ?? 1;
      if (day > lastDay) continue;
      const tx: Transaction = {
        id: `t-${month}-${p.id}`,
        data: dateInMonth(month, day),
        descrizione: p.descrizione,
        categoriaId: p.categoriaId,
        importo: p.importo,
        previstaId: p.id,
      };
      p.movimentoId = tx.id;
      data.movimenti.push(tx);
    }

    // Spese estemporanee: lo svago tende a sforare, l'abbigliamento a restare sotto budget.
    for (const [categoriaId, items] of Object.entries(extra)) {
      const howMany = categoriaId === 'svago' ? 8 : categoriaId === 'trasporti' ? 3 : 1;
      for (let k = 0; k < howMany; k++) {
        if (categoriaId === 'abbigliamento' && random() < 0.5) continue;
        if (categoriaId === 'regali' && random() < 0.4) continue;
        const [descrizione, min, max] = items[Math.floor(random() * items.length)]!;
        const day = 1 + Math.floor(random() * lastDay);
        data.movimenti.push({
          id: `t-${month}-${categoriaId}-${k}`,
          data: dateInMonth(month, day),
          descrizione,
          categoriaId,
          importo: euro(Math.round((min + random() * (max - min)) * 100) / 100),
        });
      }
    }
  }

  data.movimenti.sort((a, b) => b.data.localeCompare(a.data));
  return data;
}
