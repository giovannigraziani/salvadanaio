// Conversione dei dati salvati con versioni precedenti dello schema.
import { defaultCategories, defaultJointCategories, emptyData, newAccount, SCHEMA_VERSION } from './defaults';
import { currentMonth, dateInMonth, daysInMonth } from './month';
import type { Account, AppData, Category, Cents, Goal, ID, MonthKey, MonthPlan, PlannedExpense, Recurring, Transaction } from './types';

// ---------- Forme dei dati nelle versioni 1 e 2 ----------

interface LegacyRecurring {
  id: ID;
  descrizione: string;
  categoriaId: ID;
  importo: Cents;
  frequenza: number;
  meseInizio: MonthKey;
  meseFine?: MonthKey;
  giorno?: number;
  attiva: boolean;
}

interface LegacyPlanned extends Omit<PlannedExpense, 'data'> {
  giorno?: number;
}

interface LegacyPlan extends Omit<MonthPlan, 'spesePreviste'> {
  spesePreviste: LegacyPlanned[];
}

interface LegacyJointPlan {
  mese: MonthKey;
  budget: Record<ID, Cents>;
  spesePreviste: LegacyPlanned[];
  versamentoPartner: { importo: Cents; eseguito: boolean };
  note?: string;
}

interface LegacyJointTx extends Omit<Transaction, 'pagatoDa'> {
  pagatoDa: 'conto' | 'io' | 'partner';
}

interface LegacyData {
  version: number;
  settings?: { nome?: string; giornoStipendio?: number; datiDiEsempio?: boolean };
  conti?: { id: ID; nome: string; tipo: Account['tipo']; note?: string }[];
  categorie?: Category[];
  ricorrenze?: LegacyRecurring[];
  modello?: Account['modello'];
  piani?: Record<MonthKey, LegacyPlan>;
  movimenti?: Transaction[];
  obiettivi?: Goal[];
  cointestato?: {
    impostazioni: {
      contoId?: ID;
      nomePartner: string;
      regola: 'paritaria' | 'proporzionale' | 'percentuale';
      redditoIo: Cents;
      redditoPartner: Cents;
      percentualeIo: number;
      arrotondamento: Cents;
      saldoIniziale: Cents;
      meseSaldoIniziale: MonthKey;
    };
    categorie: Category[];
    ricorrenze: LegacyRecurring[];
    modelloBudget: Record<ID, Cents>;
    piani: Record<MonthKey, LegacyJointPlan>;
    movimenti: LegacyJointTx[];
  };
}

function convertRecurring(r: LegacyRecurring): Recurring {
  const day = Math.min(r.giorno ?? 1, daysInMonth(r.meseInizio));
  return {
    id: r.id,
    descrizione: r.descrizione,
    categoriaId: r.categoriaId,
    importo: r.importo,
    ripetizione: { tipo: 'mesi', ogni: r.frequenza || 1 },
    inizio: dateInMonth(r.meseInizio, day),
    fine: r.meseFine ? dateInMonth(r.meseFine, 31) : undefined,
    attiva: r.attiva,
  };
}

function convertPlanned(mese: MonthKey, p: LegacyPlanned): PlannedExpense {
  const { giorno, ...rest } = p;
  return { ...rest, data: giorno ? dateInMonth(mese, giorno) : undefined };
}

function earliestMonth(months: MonthKey[]): MonthKey {
  return months.length ? [...months].sort()[0]! : currentMonth();
}

/** Versione 1 o 2 → versione 3 (un conto per ogni ledger, il partner diventa un conto personale). */
function fromV2(old: LegacyData): AppData {
  const base = emptyData();
  const piani = old.piani ?? {};

  // Il mio conto personale con il ledger della versione precedente.
  const mio: Account = newAccount('personale', 'Il mio conto', {
    id: 'principale',
    titolare: old.settings?.nome,
    giornoStipendio: old.settings?.giornoStipendio ?? 27,
    meseSaldoIniziale: earliestMonth(Object.keys(piani)),
    categorie: old.categorie ?? defaultCategories,
    ricorrenze: (old.ricorrenze ?? []).map(convertRecurring),
    modello: old.modello ?? base.conti[0]!.modello,
    piani: Object.fromEntries(Object.entries(piani).map(([m, p]) => [m, { ...p, spesePreviste: p.spesePreviste.map((x) => convertPlanned(m, x)) }])),
    movimenti: old.movimenti ?? [],
  });

  // I vecchi conti di destinazione diventano conti veri, con lo stesso id (le quote continuano a puntarci).
  const others: Account[] = (old.conti ?? base.conti.slice(1)).map((c) =>
    newAccount(c.tipo, c.nome, { id: c.id === mio.id ? `${c.id}-2` : c.id, note: c.note }),
  );
  const accounts = [mio, ...others];

  const joint = old.cointestato;
  if (joint) {
    const s = joint.impostazioni;
    let target = accounts.find((a) => a.id === s.contoId && a.tipo === 'cointestato') ?? accounts.find((a) => a.tipo === 'cointestato');
    if (!target) {
      target = newAccount('cointestato', 'Conto cointestato', { id: 'cointestato' });
      accounts.push(target);
    }
    const used = Object.keys(joint.piani).length > 0 || joint.movimenti.length > 0;
    const partner = used
      ? newAccount('personale', `Conto di ${s.nomePartner || 'Partner'}`, {
          id: 'partner',
          titolare: s.nomePartner,
          meseSaldoIniziale: earliestMonth(Object.keys(joint.piani)),
          modello: {
            entrate: [{ descrizione: 'Stipendio', importo: s.redditoPartner }],
            trasferimenti: [{ descrizione: 'Versamento conto cointestato', importo: 0, contoId: target.id }],
            budget: {},
          },
        })
      : undefined;
    if (partner) {
      for (const [m, jp] of Object.entries(joint.piani))
        partner.piani[m] = {
          mese: m,
          entrate: s.redditoPartner ? [{ id: `${m}-stipendio`, descrizione: 'Stipendio', importo: s.redditoPartner }] : [],
          trasferimenti: [
            { id: `${m}-cointestato`, descrizione: 'Versamento conto cointestato', importo: jp.versamentoPartner.importo, contoId: target.id, eseguito: jp.versamentoPartner.eseguito },
          ],
          budget: {},
          spesePreviste: [],
        };
      accounts.splice(1, 0, partner);
    }
    // Il mio reddito per la regola proporzionale ora viene dal modello del mio conto.
    if (s.regola === 'proporzionale' && s.redditoIo && !mio.modello.entrate.some((e) => e.importo))
      mio.modello.entrate = [{ descrizione: 'Stipendio', importo: s.redditoIo }];

    const payer = (p: LegacyJointTx['pagatoDa']) => (p === 'io' ? mio.id : p === 'partner' ? partner?.id : undefined);
    Object.assign(target, {
      saldoIniziale: s.saldoIniziale,
      meseSaldoIniziale: s.meseSaldoIniziale,
      categorie: joint.categorie?.length ? joint.categorie : defaultJointCategories,
      ricorrenze: joint.ricorrenze.map(convertRecurring),
      modello: { entrate: [], trasferimenti: [], budget: joint.modelloBudget },
      piani: Object.fromEntries(
        Object.entries(joint.piani).map(([m, jp]) => [
          m,
          { mese: m, entrate: [], trasferimenti: [], budget: jp.budget, spesePreviste: jp.spesePreviste.map((x) => convertPlanned(m, x)), note: jp.note },
        ]),
      ),
      movimenti: joint.movimenti.map(({ pagatoDa, rimborsato, ...t }) => {
        const by = payer(pagatoDa);
        return by ? { ...t, pagatoDa: by, rimborsato } : t;
      }),
      ripartizione: {
        regola: s.regola,
        partecipanti: partner ? [mio.id, partner.id] : [mio.id],
        percentuali: partner ? { [mio.id]: s.percentualeIo, [partner.id]: 100 - s.percentualeIo } : { [mio.id]: 100 },
        arrotondamento: s.arrotondamento,
      },
    } satisfies Partial<Account>);
  }

  for (const a of accounts)
    if (a.tipo === 'cointestato' && a.ripartizione && a.ripartizione.partecipanti.length === 0) a.ripartizione.partecipanti = [mio.id];

  return {
    version: SCHEMA_VERSION,
    settings: { nome: old.settings?.nome, datiDiEsempio: old.settings?.datiDiEsempio },
    conti: accounts,
    obiettivi: old.obiettivi ?? [],
  };
}

/** Porta dati salvati con qualsiasi versione precedente allo schema attuale. */
export function migrate(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('Formato dati non valido');
  const data = raw as { version?: unknown };
  if (typeof data.version !== 'number' || data.version > SCHEMA_VERSION) throw new Error('Versione dei dati non supportata');
  if (data.version < 3) return fromV2(raw as LegacyData);
  const v3 = raw as AppData;
  return { ...v3, settings: { ...v3.settings }, conti: v3.conti ?? [], obiettivi: v3.obiettivi ?? [], version: SCHEMA_VERSION };
}
