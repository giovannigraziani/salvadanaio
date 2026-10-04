// Come si divide lo stipendio di una persona: dal 100% delle entrate alle destinazioni e alle categorie.
import { accountsOf, findAccount, shares, transactionsOfMonth, transferTarget } from './ledger';
import { sum } from './money';
import type { Account, AppData, Cents, ID, MonthKey } from './types';

export type FlowMode = 'teorico' | 'effettivo';

export type FlowKind = 'spese' | 'cointestato' | 'risparmio' | 'obiettivo' | 'conto' | 'libero';

export interface FlowNode {
  key: string;
  label: string;
  value: Cents;
  kind: FlowKind;
  /** Colore della categoria (solo per i nodi di secondo livello). */
  color?: string;
  children: FlowNode[];
}

export interface SalaryFlow {
  /** Entrate proprie dei conti personali della persona: il 100%. */
  entrate: Cents;
  nodes: FlowNode[];
  /** Quanto le uscite superano le entrate (0 se rientrano). */
  eccesso: Cents;
}

function byCategory(account: Account, values: Record<ID, Cents>, factor: number, prefix: string): FlowNode[] {
  return account.categorie
    .map((c) => ({ key: `${prefix}:${c.id}`, label: c.nome, value: Math.round((values[c.id] ?? 0) * factor), kind: 'spese' as const, color: c.colore, children: [] }))
    .filter((n) => n.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** Valori per categoria di un conto nel mese: budget (teorico) o speso (effettivo). */
function categoryValues(account: Account, month: MonthKey, mode: FlowMode): Record<ID, Cents> {
  if (mode === 'teorico') return { ...(account.piani[month]?.budget ?? account.modello.budget) };
  const values: Record<ID, Cents> = {};
  for (const t of transactionsOfMonth(account.movimenti, month)) values[t.categoriaId] = (values[t.categoriaId] ?? 0) + t.importo;
  return values;
}

/** Ridimensiona i figli perché non superino il valore del nodo padre; il resto diventa "rimasto sul conto". */
function fitChildren(parent: FlowNode, restLabel: string) {
  const total = sum(parent.children, (c) => c.value);
  if (total > parent.value && total > 0) {
    const k = parent.value / total;
    for (const c of parent.children) c.value = Math.round(c.value * k);
  }
  const rest = parent.value - sum(parent.children, (c) => c.value);
  if (parent.children.length && rest > 0) parent.children.push({ key: `${parent.key}:resto`, label: restLabel, value: rest, kind: 'libero', children: [] });
}

/**
 * Suddivisione dello stipendio di una persona nel mese.
 * - teorico: quote previste e budget del piano (o del modello se il piano manca);
 * - effettivo: quote versate e spese registrate.
 * Per i conti condivisi conta la parte di spese che spetta alla persona secondo la regola di ripartizione.
 */
export function salaryFlow(data: AppData, person: string, month: MonthKey, mode: FlowMode): SalaryFlow {
  const own = accountsOf(data, person).filter((a) => a.tipo === 'personale');
  const entrate = sum(own, (a) => sum(a.piani[month]?.entrate ?? a.modello.entrate, (e) => e.importo));
  const nodes = new Map<string, FlowNode>();

  for (const a of own) {
    const lines = a.piani[month]?.trasferimenti ?? (mode === 'teorico' ? a.modello.trasferimenti.map((t) => ({ ...t, eseguito: false })) : []);
    for (const t of lines) {
      if (mode === 'effettivo' && !t.eseguito) continue;
      if (t.importo <= 0) continue;
      const target = findAccount(data, transferTarget(data, t));
      let key: string;
      let label: string;
      let kind: FlowKind;
      if (t.obiettivoId) {
        key = `obiettivo:${t.obiettivoId}`;
        label = data.obiettivi.find((g) => g.id === t.obiettivoId)?.nome ?? 'Obiettivo';
        kind = 'obiettivo';
      } else if (target) {
        key = `conto:${target.id}`;
        label = target.nome;
        kind = target.tipo === 'cointestato' ? 'cointestato' : target.tipo === 'personale' ? 'conto' : 'risparmio';
      } else {
        key = 'conto:';
        label = 'Senza destinazione';
        kind = 'conto';
      }
      const node = nodes.get(key) ?? { key, label, value: 0, kind, children: [] };
      node.value += t.importo;
      nodes.set(key, node);
    }
  }

  // Conti condivisi: la mia parte delle loro spese, per categoria.
  for (const node of nodes.values()) {
    if (node.kind !== 'cointestato') continue;
    const joint = findAccount(data, node.key.slice('conto:'.length))!;
    const s = shares(data, joint);
    const share = sum(own, (a) => s[a.id] ?? 0);
    node.children = byCategory(joint, categoryValues(joint, month, mode), share, node.key);
    fitChildren(node, mode === 'teorico' ? 'Margine sul conto comune' : 'Non speso sul conto comune');
  }

  // Spese dei propri conti personali.
  const spending: FlowNode = { key: 'spese', label: 'Spese personali', value: 0, kind: 'spese', children: [] };
  for (const a of own) {
    const values = categoryValues(a, month, mode);
    for (const n of byCategory(a, values, 1, `spese:${a.id}`)) {
      const existing = spending.children.find((c) => c.label === n.label);
      if (existing) existing.value += n.value;
      else spending.children.push(n);
    }
  }
  spending.children.sort((a, b) => b.value - a.value);
  spending.value = sum(spending.children, (c) => c.value);

  const ordered = [...nodes.values()].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || b.value - a.value);
  if (spending.value > 0) ordered.push(spending);
  const used = sum(ordered, (n) => n.value);
  if (entrate > used) ordered.push({ key: 'libero', label: mode === 'teorico' ? 'Non allocato' : 'Non speso', value: entrate - used, kind: 'libero', children: [] });
  return { entrate, nodes: ordered, eccesso: Math.max(0, used - entrate) };
}

const kindOrder: Record<FlowKind, number> = { cointestato: 0, conto: 1, risparmio: 2, obiettivo: 3, spese: 4, libero: 5 };
