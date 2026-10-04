import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { centsToInput, formatEuro, parseEuro } from '../domain/money';
import { addMonths, monthLabel } from '../domain/month';
import type { Cents, MonthKey } from '../domain/types';
import { Icon, type IconName } from './icons';
import { navigate } from './router';

export function Money({ value, signed, className }: { value: Cents; signed?: boolean; className?: string }) {
  const text = formatEuro(value);
  return <span className={className}>{signed && value > 0 ? `+${text}` : text}</span>;
}

/** Campo per importi in euro: accetta "12,50", "1.200" ecc. e restituisce centesimi. */
export function MoneyInput({
  value,
  onChange,
  className = '',
  autoFocus,
  ariaLabel,
  id,
}: {
  value: Cents;
  onChange: (cents: Cents) => void;
  className?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  id?: string;
}) {
  const [text, setText] = useState(centsToInput(value));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(centsToInput(value));
  }, [value]);

  return (
    <input
      id={id}
      className={`input money ${invalid ? 'invalid' : ''} ${className}`}
      inputMode="decimal"
      placeholder="0"
      value={text}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = e.target.value.trim() === '' ? 0 : parseEuro(e.target.value);
        setInvalid(parsed === null);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={() => {
        focused.current = false;
        if (!invalid) setText(centsToInput(value));
      }}
    />
  );
}

export function Field({ label, hint, children, full }: { label: string; hint?: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal-body">
          <h2 id={titleId}>{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function IconButton({ icon, label, onClick, className = '' }: { icon: IconName; label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`btn ghost icon ${className}`} onClick={onClick} title={label} aria-label={label}>
      <Icon name={icon} />
    </button>
  );
}

export function MonthSwitcher({ month, onChange }: { month: MonthKey; onChange: (m: MonthKey) => void }) {
  return (
    <div className="month-switch">
      <IconButton icon="left" label="Mese precedente" onClick={() => onChange(addMonths(month, -1))} />
      <strong>{monthLabel(month)}</strong>
      <IconButton icon="right" label="Mese successivo" onClick={() => onChange(addMonths(month, 1))} />
    </div>
  );
}

/**
 * Barra di avanzamento. Per un budget: blu finché sotto soglia, gialla vicino al limite, rossa oltre.
 * Per un obiettivo (`progress`) più è piena meglio è: resta blu e diventa verde a traguardo.
 */
export function Meter({ value, max, label, progress }: { value: number; max: number; label: string; progress?: boolean }) {
  const pct = max > 0 ? (value / max) * 100 : value > 0 ? 100 : 0;
  const state = progress ? (pct >= 100 ? 'done' : '') : pct > 100 ? 'over' : pct >= 85 ? 'warn' : '';
  return (
    <div className={`meter ${state}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'bad' | 'good'; children: ReactNode }) {
  const icon: IconName = kind === 'good' ? 'check' : kind === 'info' ? 'info' : 'alert';
  return (
    <div className={`notice ${kind}`} role={kind === 'bad' ? 'alert' : undefined}>
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'active' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CategoryDot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} aria-hidden />;
}

/** Link interno: aggiorna la rotta senza ricaricare la pagina. */
export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={`#/${to}`}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

/**
 * Pulsante per azioni distruttive o importanti: il primo clic chiede conferma nella pagina stessa,
 * il secondo esegue. Torna allo stato iniziale dopo qualche secondo.
 */
export function ConfirmButton({
  children,
  question,
  confirmLabel = 'Conferma',
  onConfirm,
  className = 'btn',
}: {
  children: ReactNode;
  question: string;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(timer);
  }, [armed]);
  if (!armed)
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  return (
    <span className="confirm" role="group" aria-label={question}>
      <span className="small">{question}</span>
      <button
        type="button"
        className="btn small danger"
        autoFocus
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn small ghost" onClick={() => setArmed(false)}>
        Annulla
      </button>
    </span>
  );
}
