import { defaultCategories, emptyData, palette } from '../domain/defaults';
import { demoData } from '../domain/demo';
import { newId } from '../domain/id';
import { currentMonth, dateInMonth, monthOfDate, today } from '../domain/month';
import { createPlan, missingRecurring } from '../domain/plan';
import type {
  Account,
  AppData,
  Category,
  Goal,
  GoalContribution,
  ID,
  MonthKey,
  MonthPlan,
  PlanTemplate,
  Recurring,
  Transaction,
} from '../domain/types';
import { getState, migrate, mutate, replaceState } from './store';

// ---------- Piano mensile ----------

export function createMonthPlan(month: MonthKey) {
  mutate((d) => {
    if (!d.piani[month]) d.piani[month] = createPlan(d, month);
  });
}

/** Crea il piano copiando quello di un altro mese (entrate, ripartizione e budget). */
export function copyPlanFrom(month: MonthKey, source: MonthKey) {
  mutate((d) => {
    const from = d.piani[source];
    if (!from) return;
    const fresh = createPlan(d, month);
    fresh.entrate = from.entrate.map((e) => ({ ...e, id: newId() }));
    fresh.trasferimenti = from.trasferimenti.map((t) => ({
      id: newId(),
      descrizione: t.descrizione,
      importo: t.importo,
      contoId: t.contoId,
      obiettivoId: t.obiettivoId,
      eseguito: false,
    }));
    fresh.budget = { ...from.budget };
    d.piani[month] = fresh;
  });
}

export function updatePlan(month: MonthKey, recipe: (plan: MonthPlan, data: AppData) => void) {
  mutate((d) => {
    const plan = d.piani[month];
    if (plan) recipe(plan, d);
  });
}

export function deletePlan(month: MonthKey) {
  mutate((d) => {
    const plan = d.piani[month];
    if (!plan) return;
    // Scollega i movimenti e rimuove i versamenti sugli obiettivi generati dal piano.
    const prevIds = new Set(plan.spesePreviste.map((p) => p.id));
    for (const t of d.movimenti) if (t.previstaId && prevIds.has(t.previstaId)) delete t.previstaId;
    for (const t of plan.trasferimenti) if (t.versamentoId) removeContribution(d, t.obiettivoId, t.versamentoId);
    delete d.piani[month];
  });
}

export function syncRecurring(month: MonthKey) {
  updatePlan(month, (plan, d) => {
    plan.spesePreviste.push(...missingRecurring(plan, d.ricorrenze));
  });
}

/** Salva il piano corrente come modello per i mesi futuri. */
export function saveAsTemplate(month: MonthKey) {
  mutate((d) => {
    const plan = d.piani[month];
    if (!plan) return;
    d.modello = {
      entrate: plan.entrate.map(({ descrizione, importo }) => ({ descrizione, importo })),
      trasferimenti: plan.trasferimenti.map(({ descrizione, importo, contoId, obiettivoId }) => ({
        descrizione,
        importo,
        contoId,
        obiettivoId,
      })),
      budget: { ...plan.budget },
    };
  });
}

function removeContribution(d: AppData, goalId: ID | undefined, versamentoId: ID) {
  const goal = d.obiettivi.find((g) => g.id === goalId);
  if (goal) goal.versamenti = goal.versamenti.filter((v) => v.id !== versamentoId);
}

/** Segna una quota come versata; se va su un obiettivo registra anche il versamento. */
export function setTransferDone(month: MonthKey, transferId: ID, done: boolean) {
  updatePlan(month, (plan, d) => {
    const t = plan.trasferimenti.find((x) => x.id === transferId);
    if (!t) return;
    t.eseguito = done;
    if (t.versamentoId) {
      removeContribution(d, t.obiettivoId, t.versamentoId);
      delete t.versamentoId;
    }
    if (done && t.obiettivoId) {
      const goal = d.obiettivi.find((g) => g.id === t.obiettivoId);
      if (goal) {
        const v: GoalContribution = {
          id: newId(),
          data: dateInMonth(month, d.settings.giornoStipendio),
          importo: t.importo,
          nota: t.descrizione,
        };
        goal.versamenti.push(v);
        t.versamentoId = v.id;
      }
    }
  });
}

export function removeTransfer(month: MonthKey, transferId: ID) {
  updatePlan(month, (plan, d) => {
    const t = plan.trasferimenti.find((x) => x.id === transferId);
    if (t?.versamentoId) removeContribution(d, t.obiettivoId, t.versamentoId);
    plan.trasferimenti = plan.trasferimenti.filter((x) => x.id !== transferId);
  });
}

/** Registra il pagamento di una spesa prevista creando il movimento collegato. */
export function payPlanned(month: MonthKey, plannedId: ID, importo?: number, data?: string) {
  mutate((d) => {
    const p = d.piani[month]?.spesePreviste.find((x) => x.id === plannedId);
    if (!p || p.movimentoId) return;
    const tx: Transaction = {
      id: newId(),
      data: data ?? (monthOfDate(today()) === month ? today() : dateInMonth(month, p.giorno ?? 1)),
      descrizione: p.descrizione,
      categoriaId: p.categoriaId,
      importo: importo ?? p.importo,
      previstaId: p.id,
    };
    d.movimenti.push(tx);
    p.movimentoId = tx.id;
  });
}

export function unpayPlanned(month: MonthKey, plannedId: ID) {
  mutate((d) => {
    const p = d.piani[month]?.spesePreviste.find((x) => x.id === plannedId);
    if (!p?.movimentoId) return;
    d.movimenti = d.movimenti.filter((t) => t.id !== p.movimentoId);
    delete p.movimentoId;
  });
}

export function removePlanned(month: MonthKey, plannedId: ID) {
  updatePlan(month, (plan, d) => {
    for (const t of d.movimenti) if (t.previstaId === plannedId) delete t.previstaId;
    plan.spesePreviste = plan.spesePreviste.filter((p) => p.id !== plannedId);
  });
}

// ---------- Movimenti ----------

function findPlanned(d: AppData, plannedId: ID) {
  for (const plan of Object.values(d.piani)) {
    const p = plan.spesePreviste.find((x) => x.id === plannedId);
    if (p) return p;
  }
  return undefined;
}

/** Crea o aggiorna un movimento mantenendo coerente il collegamento con la spesa prevista. */
export function saveTransaction(tx: Transaction) {
  mutate((d) => {
    const index = d.movimenti.findIndex((t) => t.id === tx.id);
    const previous = index >= 0 ? d.movimenti[index] : undefined;
    if (previous?.previstaId && previous.previstaId !== tx.previstaId) {
      const old = findPlanned(d, previous.previstaId);
      if (old) delete old.movimentoId;
    }
    if (tx.previstaId) {
      const p = findPlanned(d, tx.previstaId);
      if (p) p.movimentoId = tx.id;
    }
    if (index >= 0) d.movimenti[index] = tx;
    else d.movimenti.push(tx);
  });
}

export function deleteTransaction(id: ID) {
  mutate((d) => {
    const tx = d.movimenti.find((t) => t.id === id);
    if (tx?.previstaId) {
      const p = findPlanned(d, tx.previstaId);
      if (p) delete p.movimentoId;
    }
    d.movimenti = d.movimenti.filter((t) => t.id !== id);
  });
}

// ---------- Obiettivi ----------

export function saveGoal(goal: Goal) {
  mutate((d) => {
    const index = d.obiettivi.findIndex((g) => g.id === goal.id);
    if (index >= 0) d.obiettivi[index] = goal;
    else d.obiettivi.push(goal);
  });
}

export function deleteGoal(id: ID) {
  mutate((d) => {
    d.obiettivi = d.obiettivi.filter((g) => g.id !== id);
    d.modello.trasferimenti = d.modello.trasferimenti.filter((t) => t.obiettivoId !== id);
    for (const plan of Object.values(d.piani))
      for (const t of plan.trasferimenti)
        if (t.obiettivoId === id) {
          delete t.obiettivoId;
          delete t.versamentoId;
        }
  });
}

export function addContribution(goalId: ID, contribution: Omit<GoalContribution, 'id'>) {
  mutate((d) => {
    d.obiettivi.find((g) => g.id === goalId)?.versamenti.push({ ...contribution, id: newId() });
  });
}

export function deleteContribution(goalId: ID, contributionId: ID) {
  mutate((d) => {
    removeContribution(d, goalId, contributionId);
    // Se il versamento veniva da una quota del piano, la quota torna "da versare".
    for (const plan of Object.values(d.piani))
      for (const t of plan.trasferimenti)
        if (t.versamentoId === contributionId) {
          t.eseguito = false;
          delete t.versamentoId;
        }
  });
}

// ---------- Impostazioni ----------

export function saveCategory(category: Category) {
  mutate((d) => {
    const index = d.categorie.findIndex((c) => c.id === category.id);
    if (index >= 0) d.categorie[index] = category;
    else d.categorie.push(category);
  });
}

export function newCategory(): Category {
  const used = getState().categorie.length;
  return { id: newId(), nome: '', tipo: 'discrezionale', colore: palette[used % palette.length]! };
}

/** Elimina una categoria solo se non è mai stata usata, altrimenti la archivia. */
export function deleteCategory(id: ID): 'eliminata' | 'archiviata' {
  const d = getState();
  const used =
    d.movimenti.some((t) => t.categoriaId === id) ||
    d.ricorrenze.some((r) => r.categoriaId === id) ||
    Object.values(d.piani).some((p) => p.spesePreviste.some((x) => x.categoriaId === id) || p.budget[id]);
  mutate((draft) => {
    if (used) {
      const c = draft.categorie.find((x) => x.id === id);
      if (c) c.archiviata = true;
    } else {
      draft.categorie = draft.categorie.filter((c) => c.id !== id);
      delete draft.modello.budget[id];
    }
  });
  return used ? 'archiviata' : 'eliminata';
}

export function saveAccount(account: Account) {
  mutate((d) => {
    const index = d.conti.findIndex((a) => a.id === account.id);
    if (index >= 0) d.conti[index] = account;
    else d.conti.push(account);
  });
}

export function deleteAccount(id: ID) {
  mutate((d) => {
    d.conti = d.conti.filter((a) => a.id !== id);
    for (const t of d.modello.trasferimenti) if (t.contoId === id) delete t.contoId;
    for (const plan of Object.values(d.piani)) for (const t of plan.trasferimenti) if (t.contoId === id) delete t.contoId;
    for (const g of d.obiettivi) if (g.contoId === id) delete g.contoId;
  });
}

export function saveRecurring(r: Recurring) {
  mutate((d) => {
    const index = d.ricorrenze.findIndex((x) => x.id === r.id);
    if (index >= 0) d.ricorrenze[index] = r;
    else d.ricorrenze.push(r);
  });
}

export function deleteRecurring(id: ID) {
  mutate((d) => {
    d.ricorrenze = d.ricorrenze.filter((r) => r.id !== id);
  });
}

export function newRecurring(): Recurring {
  return {
    id: newId(),
    descrizione: '',
    categoriaId: getState().categorie.find((c) => !c.archiviata)?.id ?? defaultCategories[0]!.id,
    importo: 0,
    frequenza: 1,
    meseInizio: currentMonth(),
    attiva: true,
  };
}

export function saveTemplate(template: PlanTemplate) {
  mutate((d) => {
    d.modello = template;
  });
}

export function updateSettings(recipe: (s: AppData['settings']) => void) {
  mutate((d) => recipe(d.settings));
}

// ---------- Dati ----------

export function exportJson(): string {
  return JSON.stringify(getState(), null, 2);
}

export function importJson(text: string) {
  replaceState(migrate(JSON.parse(text)));
}

export function resetAll() {
  replaceState(emptyData());
}

export function loadDemo() {
  replaceState(demoData(currentMonth(), new Date().getDate()));
}
