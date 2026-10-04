import { emptyData } from './defaults';
import { addMonths, dateInMonth, daysInMonth } from './month';
import { createJointPlan, jointMonthSummary } from './joint';
import { createPlan } from './plan';
import type { AppData, JointTransaction, MonthKey, Transaction } from './types';

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

  data.settings.nome = 'Giovanni';
  data.settings.datiDiEsempio = true;
  data.conti.push({ id: 'investimenti', nome: 'Conto titoli', tipo: 'investimenti' });
  data.modello = {
    entrate: [{ descrizione: 'Stipendio', importo: euro(2100) }],
    trasferimenti: [
      { descrizione: 'Versamento conto cointestato', importo: euro(820), contoId: 'cointestato' },
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
  addJointDemo(data, now, todayDay);
  return data;
}

/** Conto cointestato di esempio: affitto, bollette, spesa e uscite insieme, con una spesa anticipata. */
function addJointDemo(data: AppData, now: MonthKey, todayDay: number) {
  const random = rng(7);
  const start = addMonths(now, -3);
  const joint = data.cointestato;
  joint.impostazioni = {
    ...joint.impostazioni,
    nomePartner: 'Giulia',
    regola: 'proporzionale',
    redditoIo: euro(2100),
    redditoPartner: euro(1800),
    arrotondamento: 1000,
    saldoIniziale: euro(1200),
    meseSaldoIniziale: start,
  };
  joint.modelloBudget = {
    'c-bollette': euro(50),
    'c-spesa': euro(400),
    'c-manutenzione': euro(60),
    'c-svago': euro(120),
    'c-viaggi': euro(60),
    'c-salute': euro(30),
    'c-altro': euro(40),
  };
  joint.ricorrenze = [
    { id: 'rc-affitto', descrizione: 'Affitto', categoriaId: 'c-casa', importo: euro(750), frequenza: 1, meseInizio: start, giorno: 1, attiva: true },
    { id: 'rc-internet', descrizione: 'Internet casa', categoriaId: 'c-bollette', importo: euro(27.9), frequenza: 1, meseInizio: start, giorno: 8, attiva: true },
    { id: 'rc-luce-gas', descrizione: 'Luce e gas', categoriaId: 'c-bollette', importo: euro(138), frequenza: 2, meseInizio: start, giorno: 16, attiva: true },
    { id: 'rc-tari', descrizione: 'TARI (rata)', categoriaId: 'c-bollette', importo: euro(85), frequenza: 4, meseInizio: addMonths(start, 1), giorno: 30, attiva: true },
  ];

  const extra: Record<string, { n: number; items: [string, number, number][] }> = {
    'c-spesa': { n: 7, items: [['Supermercato', 45, 95], ['Mercato', 15, 35], ['Spesa online', 60, 110]] },
    'c-svago': { n: 3, items: [['Cena fuori insieme', 45, 80], ['Cinema', 18, 24], ['Aperitivo', 15, 30]] },
    'c-manutenzione': { n: 1, items: [['Ferramenta', 12, 40], ['Detersivi e casa', 15, 35]] },
    'c-salute': { n: 1, items: [['Farmacia', 8, 25]] },
    'c-altro': { n: 1, items: [['Regalo amici comuni', 25, 50]] },
  };

  for (let i = 0; i <= 3; i++) {
    const month = addMonths(start, i);
    const isCurrent = month === now;
    const lastDay = isCurrent ? todayDay : daysInMonth(month);
    const plan = createJointPlan(data, month);
    joint.piani[month] = plan;

    // Le quote seguono la regola: il mio versamento è allineato nel piano personale.
    const quote = jointMonthSummary(data, month).quote;
    plan.versamentoPartner = { importo: quote.partner, eseguito: !isCurrent || todayDay >= data.settings.giornoStipendio };
    for (const t of data.piani[month]?.trasferimenti ?? []) if (t.contoId === 'cointestato') t.importo = quote.io;

    for (const p of plan.spesePreviste) {
      if ((p.giorno ?? 1) > lastDay) continue;
      const tx: JointTransaction = {
        id: `tc-${month}-${p.id}`,
        data: dateInMonth(month, p.giorno ?? 1),
        descrizione: p.descrizione,
        categoriaId: p.categoriaId,
        importo: p.importo,
        previstaId: p.id,
        pagatoDa: 'conto',
      };
      p.movimentoId = tx.id;
      joint.movimenti.push(tx);
    }

    for (const [categoriaId, { n, items }] of Object.entries(extra)) {
      const howMany = isCurrent ? Math.ceil((n * lastDay) / daysInMonth(month)) : n;
      for (let k = 0; k < howMany; k++) {
        if (n === 1 && random() < 0.4) continue;
        const [descrizione, min, max] = items[Math.floor(random() * items.length)]!;
        joint.movimenti.push({
          id: `tc-${month}-${categoriaId}-${k}`,
          data: dateInMonth(month, 1 + Math.floor(random() * lastDay)),
          descrizione,
          categoriaId,
          importo: euro(Math.round((min + random() * (max - min)) * 100) / 100),
          pagatoDa: 'conto',
        });
      }
    }
  }

  // Un weekend pagato da Giulia e già rimborsato, una spesa anticipata da me ancora da rimborsare.
  joint.movimenti.push(
    { id: 'tc-weekend', data: dateInMonth(addMonths(now, -2), 14), descrizione: 'Weekend a Bologna', categoriaId: 'c-viaggi', importo: euro(186), pagatoDa: 'partner', rimborsato: true },
    { id: 'tc-anticipo', data: dateInMonth(now, Math.max(1, todayDay - 1)), descrizione: 'Lampada soggiorno', categoriaId: 'c-manutenzione', importo: euro(39.9), pagatoDa: 'io' },
  );
  joint.movimenti.sort((a, b) => b.data.localeCompare(a.data));
}
