import { newId } from '../domain/id';
import { createJointPlan, jointAccountId, jointMonthSummary } from '../domain/joint';
import { dateInMonth, monthOfDate, today } from '../domain/month';
import { createPlan, missingRecurring } from '../domain/plan';
import type { AppData, Category, ID, JointPlan, JointSettings, JointTransaction, MonthKey, Recurring } from '../domain/types';
import { setTransferDone } from './actions';
import { getState, mutate } from './store';

// ---------- Piano mensile del conto cointestato ----------

export function createJointMonthPlan(month: MonthKey) {
  mutate((d) => {
    if (!d.cointestato.piani[month]) d.cointestato.piani[month] = createJointPlan(d, month);
  });
}

export function updateJointPlan(month: MonthKey, recipe: (plan: JointPlan, data: AppData) => void) {
  mutate((d) => {
    const plan = d.cointestato.piani[month];
    if (plan) recipe(plan, d);
  });
}

export function deleteJointPlan(month: MonthKey) {
  mutate((d) => {
    const plan = d.cointestato.piani[month];
    if (!plan) return;
    const ids = new Set(plan.spesePreviste.map((p) => p.id));
    for (const t of d.cointestato.movimenti) if (t.previstaId && ids.has(t.previstaId)) delete t.previstaId;
    delete d.cointestato.piani[month];
  });
}

export function syncJointRecurring(month: MonthKey) {
  updateJointPlan(month, (plan, d) => {
    plan.spesePreviste.push(...missingRecurring(plan, d.cointestato.ricorrenze));
  });
}

export function saveJointBudgetAsTemplate(month: MonthKey) {
  mutate((d) => {
    const plan = d.cointestato.piani[month];
    if (plan) d.cointestato.modelloBudget = { ...plan.budget };
  });
}

export function setPartnerDone(month: MonthKey, done: boolean) {
  updateJointPlan(month, (plan) => {
    plan.versamentoPartner.eseguito = done;
  });
}

/** Il mio versamento è la quota "cointestato" del piano personale: la spunta vale per entrambi. */
export function setMyJointDone(month: MonthKey, done: boolean) {
  const plan = getState().piani[month];
  const contoId = jointAccountId(getState());
  for (const t of plan?.trasferimenti ?? []) if (t.contoId === contoId) setTransferDone(month, t.id, done);
}

/**
 * Porta il mio versamento al conto cointestato (nel piano personale del mese) alla quota calcolata
 * e imposta quella della partner. Se il piano personale non esiste lo crea.
 */
export function alignContributions(month: MonthKey) {
  mutate((d) => {
    const contoId = jointAccountId(d);
    const quote = jointMonthSummary(d, month).quote;
    const jointPlan = d.cointestato.piani[month];
    if (jointPlan && !jointPlan.versamentoPartner.eseguito) jointPlan.versamentoPartner.importo = quote.partner;
    if (!contoId) return;
    const plan = (d.piani[month] ??= createPlan(d, month));
    const lines = plan.trasferimenti.filter((t) => t.contoId === contoId);
    if (lines.length === 0)
      plan.trasferimenti.unshift({ id: newId(), descrizione: 'Versamento conto cointestato', importo: quote.io, contoId, eseguito: false });
    else {
      lines[0]!.importo = quote.io;
      // Eventuali altre righe verso lo stesso conto vengono azzerate: la quota è una sola.
      for (const extra of lines.slice(1)) extra.importo = 0;
    }
  });
}

// ---------- Spese comuni ----------

function findJointPlanned(d: AppData, plannedId: ID) {
  for (const plan of Object.values(d.cointestato.piani)) {
    const p = plan.spesePreviste.find((x) => x.id === plannedId);
    if (p) return p;
  }
  return undefined;
}

export function saveJointTransaction(tx: JointTransaction) {
  mutate((d) => {
    const list = d.cointestato.movimenti;
    const index = list.findIndex((t) => t.id === tx.id);
    const previous = index >= 0 ? list[index] : undefined;
    if (previous?.previstaId && previous.previstaId !== tx.previstaId) {
      const old = findJointPlanned(d, previous.previstaId);
      if (old) delete old.movimentoId;
    }
    if (tx.previstaId) {
      const p = findJointPlanned(d, tx.previstaId);
      if (p) p.movimentoId = tx.id;
    }
    const clean = { ...tx };
    if (clean.pagatoDa === 'conto') delete clean.rimborsato;
    if (index >= 0) list[index] = clean;
    else list.push(clean);
  });
}

export function deleteJointTransaction(id: ID) {
  mutate((d) => {
    const tx = d.cointestato.movimenti.find((t) => t.id === id);
    if (tx?.previstaId) {
      const p = findJointPlanned(d, tx.previstaId);
      if (p) delete p.movimentoId;
    }
    d.cointestato.movimenti = d.cointestato.movimenti.filter((t) => t.id !== id);
  });
}

export function setReimbursed(id: ID, rimborsato: boolean) {
  mutate((d) => {
    const tx = d.cointestato.movimenti.find((t) => t.id === id);
    if (tx && tx.pagatoDa !== 'conto') tx.rimborsato = rimborsato;
  });
}

export function payJointPlanned(month: MonthKey, plannedId: ID) {
  mutate((d) => {
    const p = d.cointestato.piani[month]?.spesePreviste.find((x) => x.id === plannedId);
    if (!p || p.movimentoId) return;
    const tx: JointTransaction = {
      id: newId(),
      data: monthOfDate(today()) === month ? today() : dateInMonth(month, p.giorno ?? 1),
      descrizione: p.descrizione,
      categoriaId: p.categoriaId,
      importo: p.importo,
      previstaId: p.id,
      pagatoDa: 'conto',
    };
    d.cointestato.movimenti.push(tx);
    p.movimentoId = tx.id;
  });
}

export function unpayJointPlanned(month: MonthKey, plannedId: ID) {
  mutate((d) => {
    const p = d.cointestato.piani[month]?.spesePreviste.find((x) => x.id === plannedId);
    if (!p?.movimentoId) return;
    d.cointestato.movimenti = d.cointestato.movimenti.filter((t) => t.id !== p.movimentoId);
    delete p.movimentoId;
  });
}

export function removeJointPlanned(month: MonthKey, plannedId: ID) {
  updateJointPlan(month, (plan, d) => {
    for (const t of d.cointestato.movimenti) if (t.previstaId === plannedId) delete t.previstaId;
    plan.spesePreviste = plan.spesePreviste.filter((p) => p.id !== plannedId);
  });
}

// ---------- Impostazioni ----------

export function updateJointSettings(patch: Partial<JointSettings>) {
  mutate((d) => {
    Object.assign(d.cointestato.impostazioni, patch);
  });
}

export function setJointTemplateBudget(categoriaId: ID, value: number) {
  mutate((d) => {
    if (value) d.cointestato.modelloBudget[categoriaId] = value;
    else delete d.cointestato.modelloBudget[categoriaId];
  });
}

export function saveJointCategory(category: Category) {
  mutate((d) => {
    const list = d.cointestato.categorie;
    const index = list.findIndex((c) => c.id === category.id);
    if (index >= 0) list[index] = category;
    else list.push(category);
  });
}

/** Elimina una categoria comune solo se non è mai stata usata, altrimenti la archivia. */
export function deleteJointCategory(id: ID): 'eliminata' | 'archiviata' {
  const j = getState().cointestato;
  const used =
    j.movimenti.some((t) => t.categoriaId === id) ||
    j.ricorrenze.some((r) => r.categoriaId === id) ||
    Object.values(j.piani).some((p) => p.spesePreviste.some((x) => x.categoriaId === id) || p.budget[id]);
  mutate((d) => {
    if (used) {
      const c = d.cointestato.categorie.find((x) => x.id === id);
      if (c) c.archiviata = true;
    } else {
      d.cointestato.categorie = d.cointestato.categorie.filter((c) => c.id !== id);
      delete d.cointestato.modelloBudget[id];
    }
  });
  return used ? 'archiviata' : 'eliminata';
}

export function saveJointRecurring(r: Recurring) {
  mutate((d) => {
    const list = d.cointestato.ricorrenze;
    const index = list.findIndex((x) => x.id === r.id);
    if (index >= 0) list[index] = r;
    else list.push(r);
  });
}

export function deleteJointRecurring(id: ID) {
  mutate((d) => {
    d.cointestato.ricorrenze = d.cointestato.ricorrenze.filter((r) => r.id !== id);
  });
}
