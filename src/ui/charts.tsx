import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { formatEuro, formatEuroShort, percent } from '../domain/money';
import type { Cents } from '../domain/types';

// ---------- Tooltip ----------

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = (e: MouseEvent, content: ReactNode) => {
    const x = Math.min(e.clientX + 14, window.innerWidth - 270);
    setTip({ x, y: e.clientY + 14, content });
  };
  const hide = () => setTip(null);
  const node = tip ? (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.content}
    </div>
  ) : null;
  return { show, hide, node };
}

function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="row">
      <span>
        {color && <i className="dot" style={{ background: color }} />}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

// ---------- Barra di flusso (dove vanno le entrate) ----------

export interface FlowSegment {
  key: string;
  label: string;
  value: Cents;
  color: string;
}

/** Barra orizzontale al 100% con legenda: mostra la ripartizione di un totale. */
export function FlowBar({ segments, total }: { segments: FlowSegment[]; total: Cents }) {
  const tip = useTooltip();
  const visible = segments.filter((s) => s.value > 0);
  const base = Math.max(total, visible.reduce((a, s) => a + s.value, 0));
  return (
    <div>
      <div className="flow-bar" role="img" aria-label="Ripartizione delle entrate">
        {visible.map((s) => (
          <div
            key={s.key}
            style={{ flexGrow: s.value, background: s.color }}
            onMouseMove={(e) => tip.show(e, <TipRow color={s.color} label={s.label} value={`${formatEuro(s.value)} · ${percent(s.value, base)}%`} />)}
            onMouseLeave={tip.hide}
          />
        ))}
      </div>
      <div className="legend">
        {visible.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label} <strong>{percent(s.value, base)}%</strong>
          </span>
        ))}
      </div>
      {tip.node}
    </div>
  );
}

// ---------- Barre budget vs speso ----------

export interface BudgetBarRow {
  key: string;
  label: string;
  color: string;
  value: Cents;
  budget: Cents;
}

/** Barre orizzontali della spesa per categoria con un indicatore verticale del budget. */
export function BudgetBars({ rows }: { rows: BudgetBarRow[] }) {
  const tip = useTooltip();
  const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.budget)));
  return (
    <div className="hbars">
      {rows.map((r) => {
        const over = r.value > r.budget;
        return (
          <div
            key={r.key}
            className="hbar-row"
            onMouseMove={(e) =>
              tip.show(
                e,
                <>
                  <TipRow color={r.color} label={r.label} value={formatEuro(r.value)} />
                  <TipRow label="Budget" value={formatEuro(r.budget)} />
                  <TipRow label={over ? 'Sforamento' : 'Residuo'} value={formatEuro(Math.abs(r.budget - r.value))} />
                </>,
              )
            }
            onMouseLeave={tip.hide}
          >
            <div className="name">
              <span className="dot" style={{ background: r.color }} />
              {r.label}
            </div>
            <div className="hbar-track">
              <div className="hbar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
              {r.budget > 0 && <div className="hbar-budget" style={{ left: `calc(${(r.budget / max) * 100}% - 1px)` }} />}
            </div>
            <div className="num small">
              <strong className={over ? 'text-bad' : undefined}>{formatEuroShort(r.value)}</strong>
              <span className="muted"> / {formatEuroShort(r.budget)}</span>
            </div>
          </div>
        );
      })}
      <div className="legend">
        <span>
          <i style={{ background: 'var(--text)', width: 2, borderRadius: 1 }} /> Budget
        </span>
        <span>Barra = speso</span>
      </div>
      {tip.node}
    </div>
  );
}

// ---------- Colonne impilate (andamento mensile) ----------

export interface ColumnSeries {
  key: string;
  label: string;
  color: string;
}

export interface ColumnDatum {
  key: string;
  label: string;
  values: Record<string, Cents>;
  /** Riferimento opzionale (es. budget totale del mese), disegnato come trattino. */
  reference?: Cents;
}

function niceStep(max: number): number {
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Colonne impilate per mese, con griglia leggera e tooltip per colonna. */
export function StackedColumns({ data, series, referenceLabel }: { data: ColumnDatum[]; series: ColumnSeries[]; referenceLabel?: string }) {
  const tip = useTooltip();
  // La larghezza segue il contenitore, così testi e barre restano leggibili anche su telefono.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const height = 240;
  const pad = { top: 12, right: 8, bottom: 26, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const totals = data.map((d) => series.reduce((a, s) => a + (d.values[s.key] ?? 0), 0));
  const maxValue = Math.max(1, ...totals, ...data.map((d) => d.reference ?? 0));
  const step = niceStep(maxValue);
  const top = Math.ceil(maxValue / step) * step;
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(36, band * 0.6);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const gap = 2;

  return (
    <div ref={box}>
      <svg className="columns-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Andamento mensile delle spese">
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'baseline' : 'gridline'} x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end">
              {formatEuroShort(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.left + band * i + band / 2;
          let acc = 0;
          const visible = series.filter((s) => (d.values[s.key] ?? 0) > 0);
          return (
            <g
              key={d.key}
              onMouseMove={(e) =>
                tip.show(
                  e,
                  <>
                    <strong>{d.label}</strong>
                    {[...visible].reverse().map((s) => (
                      <TipRow key={s.key} color={s.color} label={s.label} value={formatEuro(d.values[s.key] ?? 0)} />
                    ))}
                    <TipRow label="Totale" value={formatEuro(totals[i]!)} />
                    {d.reference !== undefined && referenceLabel && <TipRow label={referenceLabel} value={formatEuro(d.reference)} />}
                  </>,
                )
              }
              onMouseLeave={tip.hide}
            >
              <rect x={cx - band / 2} y={pad.top} width={band} height={innerH} fill="transparent" />
              {visible.map((s, k) => {
                const v = d.values[s.key] ?? 0;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                const isTop = k === visible.length - 1;
                const h = Math.max(0, y0 - y1 - (k > 0 ? gap : 0));
                const yTop = y1;
                if (!isTop) return <rect key={s.key} x={cx - barW / 2} y={yTop} width={barW} height={h} fill={s.color} />;
                // Solo il segmento in cima ha gli angoli arrotondati.
                const r = Math.min(4, h, barW / 2);
                const x0 = cx - barW / 2;
                const x1 = cx + barW / 2;
                const yb = yTop + h;
                return (
                  <path
                    key={s.key}
                    fill={s.color}
                    d={`M${x0},${yb} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x1 - r} Q${x1},${yTop} ${x1},${yTop + r} V${yb} Z`}
                  />
                );
              })}
              {d.reference !== undefined && d.reference > 0 && (
                <line x1={cx - barW / 2 - 6} x2={cx + barW / 2 + 6} y1={y(d.reference)} y2={y(d.reference)} stroke="var(--text)" strokeWidth={2} strokeLinecap="round" />
              )}
              <text x={cx} y={height - 8} textAnchor="middle">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {referenceLabel && (
          <span>
            <i style={{ background: 'var(--text)', height: 2 }} />
            {referenceLabel}
          </span>
        )}
      </div>
      {tip.node}
    </div>
  );
}
