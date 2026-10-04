import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { FlowKind, FlowNode, SalaryFlow } from '../domain/flow';
import { formatEuro, formatEuroShort } from '../domain/money';

/** Colore dei nodi di primo livello per tipo di destinazione (fisso: il colore segue il significato). */
const kindColors: Record<FlowKind, string> = {
  cointestato: '#2a78d6',
  conto: '#4a3aa7',
  risparmio: '#1baf7a',
  obiettivo: '#008300',
  spese: '#eb6834',
  libero: 'var(--axis)',
};

const NODE_W = 12;
const GAP1 = 8;
const GAP2 = 3;

interface Placed {
  node: FlowNode;
  x: number;
  y: number;
  h: number;
  color: string;
  parent?: Placed;
  /** Porzione del nodo padre da cui parte il collegamento. */
  sy0: number;
  sy1: number;
}

function pct(v: number, total: number) {
  if (!total) return '0%';
  const p = (v / total) * 100;
  return p < 1 && p > 0 ? '<1%' : `${Math.round(p)}%`;
}

function linkPath(x0: number, a0: number, a1: number, x1: number, b0: number, b1: number) {
  const xm = (x0 + x1) / 2;
  return `M${x0},${a0} C${xm},${a0} ${xm},${b0} ${x1},${b0} L${x1},${b1} C${xm},${b1} ${xm},${a1} ${x0},${a1} Z`;
}

/**
 * Diagramma a flussi: a sinistra lo stipendio (100%), al centro le destinazioni
 * (conti, obiettivi, spese), a destra le categorie di spesa. Su schermi stretti mostra due livelli.
 */
export function SalaryFlowChart({ flow, title }: { flow: SalaryFlow; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(300, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const total = Math.max(flow.entrate, flow.nodes.reduce((a, n) => a + n.value, 0));
  const twoLevels = width < 640;
  const childCount = twoLevels ? 0 : flow.nodes.reduce((a, n) => a + n.children.length, 0);
  const height = Math.max(300, Math.min(620, 140 + childCount * 16 + flow.nodes.length * 22));
  const gapsCol1 = (flow.nodes.length - 1) * GAP1;
  const gapsCol2 = twoLevels ? 0 : childCount * GAP2 + flow.nodes.length * GAP1;
  const k = total > 0 ? (height - Math.max(gapsCol1, gapsCol2)) / total : 0;

  const x0 = 0;
  const x1 = twoLevels ? Math.round(width * 0.42) : Math.round(width * 0.3);
  const x2 = Math.round(width * 0.63);

  // Colonna 1: destinazioni.
  const col1: Placed[] = [];
  let y = 0;
  let sy = 0;
  for (const node of flow.nodes) {
    const h = Math.max(1.5, node.value * k);
    col1.push({ node, x: x1, y, h, color: kindColors[node.kind], sy0: sy, sy1: sy + node.value * k });
    sy += node.value * k;
    y += h + GAP1;
  }
  // Colonna 2: categorie, ogni gruppo parte all'altezza del suo nodo padre.
  const col2: Placed[] = [];
  if (!twoLevels) {
    let cursor = 0;
    for (const parent of col1) {
      if (!parent.node.children.length) continue;
      let cy = Math.max(cursor, parent.y);
      let psy = parent.y;
      for (const child of parent.node.children) {
        const h = Math.max(1.5, child.value * k);
        col2.push({ node: child, x: x2, y: cy, h, color: child.color ?? 'var(--axis)', parent, sy0: psy, sy1: psy + child.value * k });
        psy += child.value * k;
        cy += h + GAP2;
      }
      cursor = cy + GAP1 - GAP2;
    }
  }
  const svgHeight = Math.max(y - GAP1, ...col2.map((c) => c.y + c.h), 1);

  const show = (e: MouseEvent, n: FlowNode, parent?: FlowNode) => {
    const rect = box.current?.getBoundingClientRect();
    setTip({
      x: Math.min(e.clientX - (rect?.left ?? 0) + 12, width - 230),
      y: e.clientY - (rect?.top ?? 0) + 12,
      content: (
        <>
          <strong>{n.label}</strong>
          <div className="row">
            <span>Importo</span>
            <strong>{formatEuro(n.value)}</strong>
          </div>
          <div className="row">
            <span>Sullo stipendio</span>
            <strong>{pct(n.value, flow.entrate)}</strong>
          </div>
          {parent && (
            <div className="row">
              <span>Su {parent.label.toLowerCase()}</span>
              <strong>{pct(n.value, parent.value)}</strong>
            </div>
          )}
        </>
      ),
    });
  };
  const hide = () => setTip(null);

  const label = (p: Placed, right: number, small: boolean) => {
    if (p.h < (small ? 9 : 11)) return null;
    const two = !small && p.h >= 30;
    // Spazio disponibile a destra del nodo; su una riga sola serve posto anche per la percentuale.
    const maxChars = Math.max(6, Math.floor((right - p.x - NODE_W - 8) / (small ? 6.2 : 6.8)) - (two ? 0 : 5));
    const name = p.node.label.length > maxChars ? `${p.node.label.slice(0, maxChars - 1)}…` : p.node.label;
    const cy = p.y + p.h / 2;
    return (
      <text x={p.x + NODE_W + 6} y={two ? cy - 3 : cy + 4} className={`flow-label ${small ? 'small' : ''}`}>
        <tspan className="flow-name">{name}</tspan>
        {two ? (
          <tspan x={p.x + NODE_W + 6} dy="15" className="flow-value">
            {formatEuroShort(p.node.value)} · {pct(p.node.value, flow.entrate)}
          </tspan>
        ) : (
          <tspan className="flow-value"> {pct(p.node.value, flow.entrate)}</tspan>
        )}
      </text>
    );
  };

  if (flow.entrate === 0 && flow.nodes.length === 0) return <p className="muted">Nessuna entrata nel periodo: imposta lo stipendio nel modello del conto personale.</p>;

  return (
    <div ref={box} className="flow-chart">
      <div className="flow-root-label">
        <strong>{title}</strong> {formatEuro(flow.entrate)} = 100%
      </div>
      <svg width={width} height={svgHeight} viewBox={`0 0 ${width} ${svgHeight}`} role="img" aria-label={`${title}: suddivisione in percentuale`}>
        {/* Collegamenti stipendio → destinazioni */}
        {col1.map((p) => (
          <path
            key={`l1-${p.node.key}`}
            d={linkPath(x0 + NODE_W, p.sy0, p.sy1, p.x, p.y, p.y + p.h)}
            fill={p.color}
            className="flow-link"
            onMouseMove={(e) => show(e, p.node)}
            onMouseLeave={hide}
          />
        ))}
        {/* Collegamenti destinazioni → categorie */}
        {col2.map((c) => (
          <path
            key={`l2-${c.node.key}`}
            d={linkPath(c.parent!.x + NODE_W, c.sy0, c.sy1, c.x, c.y, c.y + c.h)}
            fill={c.color}
            className="flow-link"
            onMouseMove={(e) => show(e, c.node, c.parent!.node)}
            onMouseLeave={hide}
          />
        ))}
        <rect x={x0} y={0} width={NODE_W} height={Math.max(1, flow.entrate * k)} rx={3} className="flow-root" />
        {col1.map((p) => (
          <g key={p.node.key} onMouseMove={(e) => show(e, p.node)} onMouseLeave={hide}>
            <rect x={p.x} y={p.y} width={NODE_W} height={p.h} rx={3} fill={p.color} />
            {label(p, twoLevels ? width : x2 - 6, false)}
          </g>
        ))}
        {col2.map((c) => (
          <g key={c.node.key} onMouseMove={(e) => show(e, c.node, c.parent!.node)} onMouseLeave={hide}>
            <rect x={c.x} y={c.y} width={NODE_W} height={c.h} rx={2} fill={c.color} />
            {label(c, width, true)}
          </g>
        ))}
      </svg>
      {tip && (
        <div className="tooltip flow-tooltip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          {tip.content}
        </div>
      )}
      <div className="actions" style={{ marginTop: 8 }}>
        <button type="button" className="btn small ghost" onClick={() => setShowTable(!showTable)} aria-expanded={showTable}>
          {showTable ? 'Nascondi il dettaglio' : twoLevels ? 'Mostra il dettaglio per categoria' : 'Mostra la tabella'}
        </button>
      </div>
      {showTable && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Voce</th>
                <th className="num">Importo</th>
                <th className="num">% stipendio</th>
              </tr>
            </thead>
            <tbody>
              {flow.nodes.flatMap((n) => [
                <tr key={n.key}>
                  <td>
                    <span className="actions" style={{ flexWrap: 'nowrap' }}>
                      <span className="dot" style={{ background: kindColors[n.kind] }} />
                      <strong>{n.label}</strong>
                    </span>
                  </td>
                  <td className="num">
                    <strong>{formatEuro(n.value)}</strong>
                  </td>
                  <td className="num">
                    <strong>{pct(n.value, flow.entrate)}</strong>
                  </td>
                </tr>,
                ...n.children.map((c) => (
                  <tr key={c.key}>
                    <td style={{ paddingLeft: 28 }}>
                      <span className="actions" style={{ flexWrap: 'nowrap' }}>
                        <span className="dot" style={{ background: c.color ?? 'var(--axis)' }} />
                        {c.label}
                      </span>
                    </td>
                    <td className="num">{formatEuro(c.value)}</td>
                    <td className="num muted">{pct(c.value, flow.entrate)}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
