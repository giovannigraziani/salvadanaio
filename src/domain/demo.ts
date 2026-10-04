import { newAccount } from './defaults';
import { createPlan, splitAmount } from './ledger';
import { addMonths, dateInMonth, daysInMonth, weekday } from './month';
import type { Account, AppData, DateKey, MonthKey, Transaction } from './types';

/** Generatore pseudo-casuale deterministico: i dati di esempio sono sempre gli stessi. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const euro = (n: number) => Math.round(n * 100);

/** Primo giorno del mese che cade nel giorno della settimana indicato (0 = domenica). */
function firstWeekday(month: MonthKey, day: number): DateKey {
  for (let d = 1; d <= 7; d++) if (weekday(dateInMonth(month, d)) === day) return dateInMonth(month, d);
  return dateInMonth(month, 1);
}

type Extra = Record<string, { n: number; items: [string, number, number][] }>;

/** Aggiunge spese estemporanee casuali al mese (nel mese corrente solo fino a oggi). */
function randomExpenses(account: Account, month: MonthKey, lastDay: number, extra: Extra, random: () => number) {
  const full = daysInMonth(month);
  for (const [categoriaId, { n, items }] of Object.entries(extra)) {
    const howMany = Math.ceil((n * lastDay) / full);
    for (let k = 0; k < howMany; k++) {
      if (n === 1 && random() < 0.4) continue;
      const [descrizione, min, max] = items[Math.floor(random() * items.length)]!;
      account.movimenti.push({
        id: `t-${account.id}-${month}-${categoriaId}-${k}`,
        data: dateInMonth(month, 1 + Math.floor(random() * lastDay)),
        descrizione,
        categoriaId,
        importo: euro(Math.round((min + random() * (max - min)) * 100) / 100),
      });
    }
  }
}

/** Paga le spese previste già scadute creando i movimenti collegati. */
function payDuePlanned(account: Account, month: MonthKey, lastDay: number) {
  for (const p of account.piani[month]?.spesePreviste ?? []) {
    const date = p.data ?? dateInMonth(month, 1);
    if (Number(date.slice(8)) > lastDay) continue;
    const tx: Transaction = { id: `t-${account.id}-${p.id}`, data: date, descrizione: p.descrizione, categoriaId: p.categoriaId, importo: p.importo, previstaId: p.id };
    p.movimentoId = tx.id;
    account.movimenti.push(tx);
  }
}

/**
 * Dati di esempio: tre mesi passati completi e il mese corrente in corso, con
 * il mio conto, quello di Giulia, il conto cointestato e il conto risparmi.
 */
export function demoData(now: MonthKey, todayDay: number): AppData {
  const random = rng(42);
  const start = addMonths(now, -3);
  const payday = 27;

  const mio = newAccount('personale', 'Conto di Giovanni', { id: 'principale', titolare: 'Giovanni', giornoStipendio: payday, meseSaldoIniziale: start, saldoIniziale: euro(1450) });
  const giulia = newAccount('personale', 'Conto di Giulia', { id: 'partner', titolare: 'Giulia', giornoStipendio: payday, meseSaldoIniziale: start, saldoIniziale: euro(980) });
  const comune = newAccount('cointestato', 'Conto cointestato', { id: 'cointestato', meseSaldoIniziale: start, saldoIniziale: euro(1200) });
  const risparmi = newAccount('risparmio', 'Conto risparmi', { id: 'risparmio', meseSaldoIniziale: start, saldoIniziale: euro(19100) });

  mio.modello = {
    entrate: [{ descrizione: 'Stipendio', importo: euro(2100) }],
    trasferimenti: [
      { descrizione: 'Versamento conto cointestato', importo: euro(820), contoId: comune.id },
      { descrizione: 'Versamento risparmi', importo: euro(300), contoId: risparmi.id },
      { descrizione: 'Accantonamento auto nuova', importo: euro(150), obiettivoId: 'auto' },
      { descrizione: 'PAC ETF', importo: euro(100), obiettivoId: 'pac' },
    ],
    budget: { abbonamenti: euro(45), salute: euro(100), trasporti: euro(180), svago: euro(150), abbigliamento: euro(80), cura: euro(70), regali: euro(40), altro: euro(50) },
  };
  mio.ricorrenze = [
    { id: 'r-spotify', descrizione: 'Spotify', categoriaId: 'abbonamenti', importo: euro(11.99), ripetizione: { tipo: 'mesi', ogni: 1 }, inizio: dateInMonth(start, 5), attiva: true },
    { id: 'r-telefono', descrizione: 'Telefono', categoriaId: 'abbonamenti', importo: euro(9.99), ripetizione: { tipo: 'mesi', ogni: 1 }, inizio: dateInMonth(start, 12), attiva: true },
    { id: 'r-palestra', descrizione: 'Palestra', categoriaId: 'cura', importo: euro(45), ripetizione: { tipo: 'mesi', ogni: 1 }, inizio: dateInMonth(start, 1), attiva: true },
    { id: 'r-cloud', descrizione: 'Archiviazione cloud', categoriaId: 'abbonamenti', importo: euro(29.99), ripetizione: { tipo: 'mesi', ogni: 12 }, inizio: dateInMonth(addMonths(now, -2), 18), attiva: true },
    { id: 'r-dentista', descrizione: 'Pulizia denti', categoriaId: 'salute', importo: euro(80), ripetizione: { tipo: 'mesi', ogni: 6 }, inizio: dateInMonth(addMonths(now, -1), 20), attiva: true },
    { id: 'r-assicurazione', descrizione: 'Rata assicurazione auto', categoriaId: 'trasporti', importo: euro(95), ripetizione: { tipo: 'mesi', ogni: 3 }, inizio: dateInMonth(start, 10), attiva: true },
    // Visita a settimane alterne il giovedì: alcuni mesi due, altri tre.
    { id: 'r-fisioterapia', descrizione: 'Fisioterapia', categoriaId: 'salute', importo: euro(40), ripetizione: { tipo: 'settimane', ogni: 2 }, inizio: firstWeekday(start, 4), attiva: true },
  ];

  giulia.modello = {
    entrate: [{ descrizione: 'Stipendio', importo: euro(1800) }],
    trasferimenti: [{ descrizione: 'Versamento conto cointestato', importo: euro(700), contoId: comune.id }],
    budget: { abbonamenti: euro(25), trasporti: euro(120), svago: euro(120), abbigliamento: euro(100), cura: euro(80), altro: euro(40) },
  };
  giulia.ricorrenze = [
    { id: 'rg-telefono', descrizione: 'Telefono', categoriaId: 'abbonamenti', importo: euro(7.99), ripetizione: { tipo: 'mesi', ogni: 1 }, inizio: dateInMonth(start, 3), attiva: true },
    { id: 'rg-yoga', descrizione: 'Corso di yoga', categoriaId: 'cura', importo: euro(15), ripetizione: { tipo: 'settimane', ogni: 1 }, inizio: firstWeekday(start, 2), attiva: true },
  ];

  comune.ripartizione = { regola: 'proporzionale', partecipanti: [mio.id, giulia.id], percentuali: {}, arrotondamento: 1000 };
  comune.modello.budget = { 'c-bollette': euro(50), 'c-spesa': euro(400), 'c-manutenzione': euro(60), 'c-svago': euro(120), 'c-viaggi': euro(60), 'c-salute': euro(30), 'c-altro': euro(40) };
  comune.ricorrenze = [
    { id: 'rc-affitto', descrizione: 'Affitto', categoriaId: 'c-casa', importo: euro(750), ripetizione: { tipo: 'mesi', ogni: 1 }, inizio: dateInMonth(start, 1), attiva: true },
    { id: 'rc-internet', descrizione: 'Internet casa', categoriaId: 'c-bollette', importo: euro(27.9), ripetizione: { tipo: 'mesi', ogni: 1 }, inizio: dateInMonth(start, 8), attiva: true },
    { id: 'rc-luce-gas', descrizione: 'Luce e gas', categoriaId: 'c-bollette', importo: euro(138), ripetizione: { tipo: 'mesi', ogni: 2 }, inizio: dateInMonth(start, 16), attiva: true },
    { id: 'rc-tari', descrizione: 'TARI (rata)', categoriaId: 'c-bollette', importo: euro(85), ripetizione: { tipo: 'mesi', ogni: 4 }, inizio: dateInMonth(addMonths(start, 1), 30), attiva: true },
  ];

  const data: AppData = {
    version: 3,
    settings: { nome: 'Giovanni', datiDiEsempio: true },
    conti: [mio, giulia, comune, risparmi],
    obiettivi: [
      { id: 'auto', nome: 'Auto nuova', tipo: 'acquisto', target: euro(8000), scadenza: addMonths(now, 30), contributoMensile: euro(150), saldoIniziale: euro(2400), versamenti: [], contoId: risparmi.id, priorita: 2 },
      { id: 'casa', nome: 'Anticipo prima casa', tipo: 'casa', target: euro(45000), scadenza: addMonths(now, 60), saldoIniziale: euro(9500), versamenti: [], contoId: risparmi.id, priorita: 1 },
      { id: 'emergenza', nome: 'Fondo emergenza', tipo: 'emergenza', target: euro(6000), saldoIniziale: euro(6000), versamenti: [], contoId: risparmi.id, priorita: 1 },
      { id: 'pac', nome: 'PAC ETF azionario globale', tipo: 'investimento', target: euro(20000), contributoMensile: euro(100), saldoIniziale: euro(1200), versamenti: [], contoId: risparmi.id, priorita: 3 },
    ],
  };

  const personalExtra: Extra = {
    trasporti: { n: 3, items: [['Benzina', 45, 70], ['Parcheggio', 3, 12], ['Treno', 8, 25]] },
    svago: { n: 8, items: [['Aperitivo', 12, 25], ['Cena fuori', 30, 55], ['Cinema', 9, 18], ['Concerto', 35, 60], ['Pizza con amici', 15, 25]] },
    abbigliamento: { n: 1, items: [['Scarpe', 60, 110], ['Maglione', 30, 60]] },
    cura: { n: 1, items: [['Barbiere', 18, 25], ['Integratori', 15, 30]] },
    regali: { n: 1, items: [['Regalo compleanno', 25, 50]] },
    altro: { n: 1, items: [['Libri', 12, 30], ['Elettronica', 20, 80]] },
    salute: { n: 1, items: [['Farmacia', 8, 25]] },
  };
  const giuliaExtra: Extra = {
    trasporti: { n: 2, items: [['Abbonamento bus', 35, 35], ['Benzina', 40, 60]] },
    svago: { n: 4, items: [['Cena con amiche', 25, 45], ['Mostra', 10, 18], ['Libreria', 12, 25]] },
    abbigliamento: { n: 1, items: [['Vestito', 40, 90], ['Borsa', 50, 120]] },
    altro: { n: 1, items: [['Piante', 10, 30]] },
  };
  const jointExtra: Extra = {
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
    const paid = !isCurrent || todayDay >= payday;
    for (const a of data.conti) a.piani[month] = createPlan(a, month);

    // Le quote verso il cointestato seguono la regola di ripartizione sul budget comune del mese.
    const need = Object.values(comune.piani[month]!.budget).reduce((x, y) => x + y, 0);
    const quote = splitAmount(data, comune, need);
    for (const a of [mio, giulia])
      for (const t of a.piani[month]!.trasferimenti) {
        if (t.contoId === comune.id) t.importo = quote[a.id] ?? t.importo;
        if (!paid) continue;
        t.eseguito = true;
        const goal = data.obiettivi.find((g) => g.id === t.obiettivoId);
        if (goal) {
          const v = { id: `v-${month}-${goal.id}`, data: dateInMonth(month, payday), importo: t.importo, nota: t.descrizione };
          goal.versamenti.push(v);
          t.versamentoId = v.id;
        }
      }

    for (const a of [mio, giulia, comune]) payDuePlanned(a, month, lastDay);
    randomExpenses(mio, month, lastDay, personalExtra, random);
    randomExpenses(giulia, month, lastDay, giuliaExtra, random);
    randomExpenses(comune, month, lastDay, jointExtra, random);
  }

  // Un weekend pagato da Giulia e già rimborsato, una spesa anticipata da me ancora da rimborsare.
  comune.movimenti.push(
    { id: 't-weekend', data: dateInMonth(addMonths(now, -2), 14), descrizione: 'Weekend a Bologna', categoriaId: 'c-viaggi', importo: euro(186), pagatoDa: giulia.id, rimborsato: true },
    { id: 't-anticipo', data: dateInMonth(now, Math.max(1, todayDay - 1)), descrizione: 'Lampada soggiorno', categoriaId: 'c-manutenzione', importo: euro(39.9), pagatoDa: mio.id },
  );
  for (const a of data.conti) a.movimenti.sort((x, y) => y.data.localeCompare(x.data));
  return data;
}
