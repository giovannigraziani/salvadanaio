import { DEFAULT_ME, emptyData, newAccount } from '../domain/defaults';
import { demoData } from '../domain/demo';
import { newId } from '../domain/id';
import { createPlan, missingRecurring, summarizePlan, splitAmount } from '../domain/ledger';
import { migrate } from '../domain/migrate';
import { currentMonth, dateInMonth, monthOfDate, today } from '../domain/month';
import type {
  Account,
  AccountType,
  AppData,
  Category,
  Goal,
  GoalContribution,
  ID,
  MonthKey,
  MonthPlan,
  PlannedExpense,
  PlanTemplate,
  Recurring,
  Settings,
  Transaction,
} from '../domain/types';
import { getState, mutate, replaceState } from './store';

/** Applica una modifica al conto indicato (se esiste). */
function onAccount(id: ID, recipe: (account: Account, data: AppData) => void) {
  mutate((d) => {
    const account = d.conti.find((a) => a.id === id);
    if (account) recipe(account, d);
  });
}

// ---------- Conti ----------

/** Aggiunge un conto e ne restituisce l'id. Un nuovo conto personale partecipa ai conti cointestati. */
export function addAccount(tipo: AccountType, nome: string, titolare?: string): ID {
  const account = newAccount(tipo, nome, { titolare: titolare || undefined });
  mutate((d) => {
    if (tipo === 'cointestato')
      account.ripartizione!.partecipanti = d.conti.filter((a) => a.tipo === 'personale' && !a.archiviato).map((a) => a.id);
    if (tipo === 'personale') for (const a of d.conti) if (a.tipo === 'cointestato' && a.ripartizione) a.ripartizione.partecipanti.push(account.id);
    d.conti.push(account);
  });
  return account.id;
}

export function updateAccount(id: ID, patch: Partial<Account>) {
  onAccount(id, (a) => Object.assign(a, patch));
}

export function moveAccount(id: ID, delta: -1 | 1) {
  mutate((d) => {
    const i = d.conti.findIndex((a) => a.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= d.conti.length) return;
    [d.conti[i], d.conti[j]] = [d.conti[j]!, d.conti[i]!];
  });
}

/** Elimina un conto e scollega tutto ciò che lo riguarda (quote, obiettivi, anticipi). */
export function deleteAccount(id: ID) {
  mutate((d) => {
    d.conti = d.conti.filter((a) => a.id !== id);
    for (const a of d.conti) {
      for (const t of a.modello.trasferimenti) if (t.contoId === id) delete t.contoId;
      for (const plan of Object.values(a.piani)) for (const t of plan.trasferimenti) if (t.contoId === id) delete t.contoId;
      for (const t of a.movimenti)
        if (t.pagatoDa === id) {
          delete t.pagatoDa;
          delete t.rimborsato;
        }
      if (a.ripartizione) a.ripartizione.partecipanti = a.ripartizione.partecipanti.filter((p) => p !== id);
    }
    for (const g of d.obiettivi) if (g.contoId === id) delete g.contoId;
  });
}

// ---------- Piano mensile ----------

export function createMonthPlan(accountId: ID, month: MonthKey) {
  onAccount(accountId, (a) => {
    a.piani[month] ??= createPlan(a, month);
  });
}

/** Crea il piano copiando entrate, quote e budget da un altro mese; le spese previste vengono dalle ricorrenze. */
export function copyPlanFrom(accountId: ID, month: MonthKey, source: MonthKey) {
  onAccount(accountId, (a) => {
    const from = a.piani[source];
    if (!from) return;
    const fresh = createPlan(a, month);
    fresh.entrate = from.entrate.map((e) => ({ ...e, id: newId() }));
    fresh.trasferimenti = from.trasferimenti.map(({ descrizione, importo, contoId, obiettivoId }) => ({ id: newId(), descrizione, importo, contoId, obiettivoId, eseguito: false }));
    fresh.budget = { ...from.budget };
    a.piani[month] = fresh;
  });
}

export function updatePlan(accountId: ID, month: MonthKey, recipe: (plan: MonthPlan, account: Account, data: AppData) => void) {
  onAccount(accountId, (a, d) => {
    const plan = a.piani[month];
    if (plan) recipe(plan, a, d);
  });
}

function removeContribution(d: AppData, goalId: ID | undefined, versamentoId: ID) {
  const goal = d.obiettivi.find((g) => g.id === goalId);
  if (goal) goal.versamenti = goal.versamenti.filter((v) => v.id !== versamentoId);
}

export function deletePlan(accountId: ID, month: MonthKey) {
  onAccount(accountId, (a, d) => {
    const plan = a.piani[month];
    if (!plan) return;
    // Scollega i movimenti e rimuove i versamenti sugli obiettivi generati dal piano.
    const ids = new Set(plan.spesePreviste.map((p) => p.id));
    for (const t of a.movimenti) if (t.previstaId && ids.has(t.previstaId)) delete t.previstaId;
    for (const t of plan.trasferimenti) if (t.versamentoId) removeContribution(d, t.obiettivoId, t.versamentoId);
    delete a.piani[month];
  });
}

export function syncRecurring(accountId: ID, month: MonthKey) {
  updatePlan(accountId, month, (plan, a) => plan.spesePreviste.push(...missingRecurring(plan, a.ricorrenze)));
}

/** Salva il piano del mese come modello per i mesi futuri. */
export function saveAsTemplate(accountId: ID, month: MonthKey) {
  onAccount(accountId, (a) => {
    const plan = a.piani[month];
    if (!plan) return;
    a.modello = {
      entrate: plan.entrate.map(({ descrizione, importo }) => ({ descrizione, importo })),
      trasferimenti: plan.trasferimenti.map(({ descrizione, importo, contoId, obiettivoId }) => ({ descrizione, importo, contoId, obiettivoId })),
      budget: { ...plan.budget },
    };
  });
}

/** Segna una quota come versata; se va su un obiettivo registra anche il versamento sull'obiettivo. */
export function setTransferDone(accountId: ID, month: MonthKey, transferId: ID, done: boolean) {
  updatePlan(accountId, month, (plan, a, d) => {
    const t = plan.trasferimenti.find((x) => x.id === transferId);
    if (!t) return;
    t.eseguito = done;
    if (t.versamentoId) {
      removeContribution(d, t.obiettivoId, t.versamentoId);
      delete t.versamentoId;
    }
    const goal = d.obiettivi.find((g) => g.id === t.obiettivoId);
    if (done && goal) {
      const v: GoalContribution = { id: newId(), data: dateInMonth(month, a.giornoStipendio ?? 27), importo: t.importo, nota: `${t.descrizione} (${a.nome})` };
      goal.versamenti.push(v);
      t.versamentoId = v.id;
    }
  });
}

export function removeTransfer(accountId: ID, month: MonthKey, transferId: ID) {
  updatePlan(accountId, month, (plan, _a, d) => {
    const t = plan.trasferimenti.find((x) => x.id === transferId);
    if (t?.versamentoId) removeContribution(d, t.obiettivoId, t.versamentoId);
    plan.trasferimenti = plan.trasferimenti.filter((x) => x.id !== transferId);
  });
}

export function savePlanned(accountId: ID, month: MonthKey, p: PlannedExpense) {
  updatePlan(accountId, month, (plan) => {
    const i = plan.spesePreviste.findIndex((x) => x.id === p.id);
    if (i >= 0) plan.spesePreviste[i] = p;
    else plan.spesePreviste.push(p);
  });
}

/** Registra il pagamento di una spesa prevista creando il movimento collegato. */
export function payPlanned(accountId: ID, month: MonthKey, plannedId: ID) {
  onAccount(accountId, (a) => {
    const p = a.piani[month]?.spesePreviste.find((x) => x.id === plannedId);
    // Le voci a consumo si riempiono registrando le singole spese, non con un pagamento unico.
    if (!p || p.movimentoId || p.aConsumo) return;
    const tx: Transaction = {
      id: newId(),
      data: monthOfDate(today()) === month ? (p.data && p.data < today() ? p.data : today()) : (p.data ?? dateInMonth(month, 1)),
      descrizione: p.descrizione,
      categoriaId: p.categoriaId,
      importo: p.importo,
      previstaId: p.id,
    };
    a.movimenti.push(tx);
    p.movimentoId = tx.id;
  });
}

export function unpayPlanned(accountId: ID, month: MonthKey, plannedId: ID) {
  onAccount(accountId, (a) => {
    const p = a.piani[month]?.spesePreviste.find((x) => x.id === plannedId);
    if (!p?.movimentoId) return;
    a.movimenti = a.movimenti.filter((t) => t.id !== p.movimentoId);
    delete p.movimentoId;
  });
}

export function removePlanned(accountId: ID, month: MonthKey, plannedId: ID) {
  updatePlan(accountId, month, (plan, a) => {
    for (const t of a.movimenti) if (t.previstaId === plannedId) delete t.previstaId;
    plan.spesePreviste = plan.spesePreviste.filter((p) => p.id !== plannedId);
  });
}

/**
 * Conto condiviso: porta il versamento di ogni partecipante (nel suo piano del mese) alla quota
 * calcolata dalla regola sul budget del mese. Crea i piani mancanti e le quote mancanti.
 */
export function alignContributions(jointId: ID, month: MonthKey) {
  mutate((d) => {
    const joint = d.conti.find((a) => a.id === jointId);
    if (!joint) return;
    const quote = splitAmount(d, joint, summarizePlan(d, joint, month).budget);
    for (const [id, importo] of Object.entries(quote)) {
      const p = d.conti.find((a) => a.id === id);
      if (!p) continue;
      const plan = (p.piani[month] ??= createPlan(p, month));
      const lines = plan.trasferimenti.filter((t) => t.contoId === jointId);
      if (lines.length === 0) plan.trasferimenti.unshift({ id: newId(), descrizione: `Versamento ${joint.nome}`, importo, contoId: jointId, eseguito: false });
      else {
        if (!lines[0]!.eseguito) lines[0]!.importo = importo;
        for (const extra of lines.slice(1)) if (!extra.eseguito) extra.importo = 0;
      }
    }
  });
}

// ---------- Modello ----------

export function updateTemplate(accountId: ID, recipe: (modello: PlanTemplate, account: Account) => void) {
  onAccount(accountId, (a) => recipe(a.modello, a));
}

// ---------- Spese ----------

function findPlanned(a: Account, plannedId: ID) {
  for (const plan of Object.values(a.piani)) {
    const p = plan.spesePreviste.find((x) => x.id === plannedId);
    if (p) return p;
  }
  return undefined;
}

/** Crea o aggiorna una spesa mantenendo coerente il collegamento con la spesa prevista. */
export function saveTransaction(accountId: ID, tx: Transaction) {
  onAccount(accountId, (a) => {
    const index = a.movimenti.findIndex((t) => t.id === tx.id);
    const previous = index >= 0 ? a.movimenti[index] : undefined;
    if (previous?.previstaId && previous.previstaId !== tx.previstaId) {
      const old = findPlanned(a, previous.previstaId);
      if (old && !old.aConsumo) delete old.movimentoId;
    }
    if (tx.previstaId) {
      const p = findPlanned(a, tx.previstaId);
      if (p && !p.aConsumo) p.movimentoId = tx.id;
    }
    const clean = { ...tx };
    if (!clean.pagatoDa) delete clean.rimborsato;
    if (index >= 0) a.movimenti[index] = clean;
    else a.movimenti.push(clean);
  });
}

export function deleteTransaction(accountId: ID, id: ID) {
  onAccount(accountId, (a) => {
    const tx = a.movimenti.find((t) => t.id === id);
    if (tx?.previstaId) {
      const p = findPlanned(a, tx.previstaId);
      if (p?.movimentoId === tx.id) delete p.movimentoId;
    }
    a.movimenti = a.movimenti.filter((t) => t.id !== id);
  });
}

export function setReimbursed(accountId: ID, txId: ID, rimborsato: boolean) {
  onAccount(accountId, (a) => {
    const tx = a.movimenti.find((t) => t.id === txId);
    if (tx?.pagatoDa) tx.rimborsato = rimborsato;
  });
}

// ---------- Categorie e ricorrenze di un conto ----------

export function saveCategory(accountId: ID, category: Category) {
  onAccount(accountId, (a) => {
    const i = a.categorie.findIndex((c) => c.id === category.id);
    if (i >= 0) a.categorie[i] = category;
    else a.categorie.push(category);
  });
}

/** Elimina una categoria solo se non è mai stata usata, altrimenti la archivia. */
export function deleteCategory(accountId: ID, id: ID): 'eliminata' | 'archiviata' {
  const a = getState().conti.find((x) => x.id === accountId);
  if (!a) return 'eliminata';
  const used =
    a.movimenti.some((t) => t.categoriaId === id) ||
    a.ricorrenze.some((r) => r.categoriaId === id) ||
    Object.values(a.piani).some((p) => p.spesePreviste.some((x) => x.categoriaId === id) || p.budget[id]);
  onAccount(accountId, (draft) => {
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

export function saveRecurring(accountId: ID, r: Recurring) {
  onAccount(accountId, (a) => {
    const i = a.ricorrenze.findIndex((x) => x.id === r.id);
    if (i >= 0) a.ricorrenze[i] = r;
    else a.ricorrenze.push(r);
  });
}

export function deleteRecurring(accountId: ID, id: ID) {
  onAccount(accountId, (a) => {
    a.ricorrenze = a.ricorrenze.filter((r) => r.id !== id);
  });
}

// ---------- Obiettivi ----------

export function saveGoal(goal: Goal) {
  mutate((d) => {
    const i = d.obiettivi.findIndex((g) => g.id === goal.id);
    if (i >= 0) d.obiettivi[i] = goal;
    else d.obiettivi.push(goal);
  });
}

export function deleteGoal(id: ID) {
  mutate((d) => {
    d.obiettivi = d.obiettivi.filter((g) => g.id !== id);
    for (const a of d.conti) {
      a.modello.trasferimenti = a.modello.trasferimenti.filter((t) => t.obiettivoId !== id);
      for (const plan of Object.values(a.piani))
        for (const t of plan.trasferimenti)
          if (t.obiettivoId === id) {
            delete t.obiettivoId;
            delete t.versamentoId;
          }
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
    // Se il versamento veniva da una quota di un piano, la quota torna "da versare".
    for (const a of d.conti)
      for (const plan of Object.values(a.piani))
        for (const t of plan.trasferimenti)
          if (t.versamentoId === contributionId) {
            t.eseguito = false;
            delete t.versamentoId;
          }
  });
}

// ---------- Impostazioni e dati ----------

export function updateSettings(recipe: (s: Settings) => void) {
  mutate((d) => recipe(d.settings));
}

/** Cambia il mio nome anche come titolare dei miei conti. */
export function setMyName(nome: string) {
  mutate((d) => {
    const old = d.settings.nome?.trim() || d.conti.find((a) => a.tipo === 'personale')?.titolare || DEFAULT_ME;
    const next = nome.trim();
    d.settings.nome = next || undefined;
    if (!next) return;
    for (const a of d.conti) if (a.titolare === old) a.titolare = next;
  });
}

export function addValuation(accountId: ID, data: string, valore: number) {
  onAccount(accountId, (a) => {
    (a.valutazioni ??= []).push({ id: newId(), data, valore });
  });
}

export function deleteValuation(accountId: ID, id: ID) {
  onAccount(accountId, (a) => {
    a.valutazioni = (a.valutazioni ?? []).filter((v) => v.id !== id);
  });
}

export function markBackup() {
  updateSettings((s) => void (s.ultimoBackup = today()));
}

export function exportJson(): string {
  return JSON.stringify(getState(), null, 2);
}

export function importJson(text: string) {
  replaceState(migrate(JSON.parse(text)));
}

export function resetAll() {
  const fresh = emptyData();
  fresh.settings.primoUtilizzo = today();
  replaceState(fresh);
}

export function loadDemo() {
  replaceState(demoData(currentMonth(), new Date().getDate()));
}
