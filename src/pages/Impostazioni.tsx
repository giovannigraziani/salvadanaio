import { useRef, useState, type FormEvent } from 'react';
import { palette } from '../domain/defaults';
import { newId } from '../domain/id';
import { formatEuro, sum } from '../domain/money';
import { monthLabel } from '../domain/month';
import { frequencyLabels, monthlyEquivalent } from '../domain/recurring';
import type { Account, AccountType, AppData, Category, Frequency, PlanTemplate, Recurring } from '../domain/types';
import {
  deleteAccount,
  deleteCategory,
  deleteRecurring,
  exportJson,
  importJson,
  loadDemo,
  newCategory,
  newRecurring,
  resetAll,
  saveAccount,
  saveCategory,
  saveRecurring,
  saveTemplate,
  updateSettings,
} from '../store/actions';
import { getState, useData } from '../store/store';
import { CategoryDot, ConfirmButton, Field, IconButton, Modal, MoneyInput, Notice, Segmented } from '../ui/components';
import { IncomeEditor, TransferEditor } from '../ui/editors';
import { Icon } from '../ui/icons';
import { getTheme, setTheme, type ThemeChoice } from '../ui/theme';

export function Impostazioni() {
  const data = useData();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Impostazioni</h1>
          <p>Modello mensile, spese ricorrenti, categorie, conti e backup dei dati.</p>
        </div>
      </div>
      <div className="stack">
        <TemplateSection data={data} />
        <RecurringSection data={data} />
        <div className="grid grid-2">
          <CategoriesSection data={data} />
          <AccountsSection data={data} />
        </div>
        <GeneralSection data={data} />
        <DataSection />
      </div>
    </>
  );
}

// ---------- Modello mensile ----------

function TemplateSection({ data }: { data: AppData }) {
  const t = data.modello;
  const save = (recipe: (draft: PlanTemplate) => void) => {
    const draft = structuredClone(t);
    recipe(draft);
    saveTemplate(draft);
  };
  const entrate = sum(t.entrate, (e) => e.importo);
  const quote = sum(t.trasferimenti, (x) => x.importo);
  const budget = sum(Object.values(t.budget), (b) => b);
  const libero = entrate - quote - budget;
  const ricorrenti = sum(data.ricorrenze.filter((r) => r.attiva), monthlyEquivalent);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Modello mensile</h2>
          <p>Il punto di partenza di ogni nuovo piano: cosa entra, cosa versi sui conti e quanto ti concedi per categoria.</p>
        </div>
      </div>
      <div className="grid grid-2">
        <div>
          <h3 style={{ marginBottom: 8 }}>Entrate</h3>
          <IncomeEditor
            lines={t.entrate}
            onChange={(i, patch) => save((d) => (patch === null ? d.entrate.splice(i, 1) : Object.assign(d.entrate[i]!, patch)))}
            onAdd={() => save((d) => d.entrate.push({ descrizione: 'Nuova entrata', importo: 0 }))}
          />
          <h3 style={{ margin: '18px 0 8px' }}>Ripartizione</h3>
          <TransferEditor
            lines={t.trasferimenti}
            conti={data.conti}
            obiettivi={data.obiettivi}
            onChange={(i, patch) => save((d) => (patch === null ? d.trasferimenti.splice(i, 1) : Object.assign(d.trasferimenti[i]!, patch)))}
            onAdd={() => save((d) => d.trasferimenti.push({ descrizione: 'Nuova quota', importo: 0 }))}
          />
        </div>
        <div>
          <h3 style={{ marginBottom: 8 }}>Budget per categoria</h3>
          <div className="rows">
            {data.categorie
              .filter((c) => !c.archiviata)
              .map((c) => (
                <div key={c.id} className="inline-row" style={{ gridTemplateColumns: '1fr 120px' }}>
                  <span className="actions" style={{ flexWrap: 'nowrap' }}>
                    <CategoryDot color={c.colore} />
                    {c.nome}
                  </span>
                  <MoneyInput
                    className="compact"
                    value={t.budget[c.id] ?? 0}
                    ariaLabel={`Budget ${c.nome}`}
                    onChange={(v) =>
                      save((d) => {
                        if (v) d.budget[c.id] = v;
                        else delete d.budget[c.id];
                      })
                    }
                  />
                </div>
              ))}
          </div>
        </div>
      </div>
      <div className="section-gap">
        <Notice kind={libero < 0 ? 'bad' : 'info'}>
          Entrate {formatEuro(entrate)} − quote {formatEuro(quote)} − budget {formatEuro(budget)} ={' '}
          <strong className={libero < 0 ? 'text-bad' : undefined}>{formatEuro(libero)} non allocati</strong>.
          {ricorrenti > 0 && ` Le spese ricorrenti valgono in media ${formatEuro(ricorrenti)} al mese: assicurati che il budget le copra.`}
        </Notice>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Le modifiche valgono per i piani creati da ora in poi. I piani già esistenti non cambiano.
      </p>
    </div>
  );
}

// ---------- Spese ricorrenti ----------

function RecurringSection({ data }: { data: AppData }) {
  const [editing, setEditing] = useState<Recurring | null>(null);
  const categories = new Map(data.categorie.map((c) => [c.id, c]));
  const active = data.ricorrenze.filter((r) => r.attiva);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Spese ricorrenti</h2>
          <p>
            Abbonamenti, rate, visite periodiche: entrano da sole nel piano dei mesi giusti. Costo medio:{' '}
            <strong>{formatEuro(sum(active, monthlyEquivalent))}/mese</strong>, <strong>{formatEuro(sum(active, monthlyEquivalent) * 12)}/anno</strong>.
          </p>
        </div>
        <button type="button" className="btn small primary" onClick={() => setEditing(newRecurring())}>
          <Icon name="plus" /> Aggiungi
        </button>
      </div>
      {data.ricorrenze.length === 0 ? (
        <p className="muted">Nessuna spesa ricorrente.</p>
      ) : (
        <ul className="list">
          {[...data.ricorrenze]
            .sort((a, b) => Number(b.attiva) - Number(a.attiva) || b.importo / b.frequenza - a.importo / a.frequenza)
            .map((r) => {
              const c = categories.get(r.categoriaId);
              return (
                <li key={r.id} className="list-item" style={{ opacity: r.attiva ? 1 : 0.55 }}>
                  <CategoryDot color={c?.colore ?? 'var(--axis)'} />
                  <div className="grow">
                    <div className="title">{r.descrizione}</div>
                    <div className="sub">
                      {frequencyLabels[r.frequenza]} da {monthLabel(r.meseInizio).toLowerCase()}
                      {r.meseFine ? ` a ${monthLabel(r.meseFine).toLowerCase()}` : ''} · {c?.nome}
                      {!r.attiva && ' · in pausa'}
                    </div>
                  </div>
                  <div className="num">
                    <strong>{formatEuro(r.importo)}</strong>
                    {r.frequenza > 1 && <div className="small muted">{formatEuro(monthlyEquivalent(r))}/mese</div>}
                  </div>
                  <IconButton icon="edit" label={`Modifica ${r.descrizione}`} onClick={() => setEditing(r)} />
                </li>
              );
            })}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.descrizione ? 'Modifica spesa ricorrente' : 'Nuova spesa ricorrente'}>
        {editing && <RecurringForm data={data} initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function RecurringForm({ data, initial, onDone }: { data: AppData; initial: Recurring; onDone: () => void }) {
  const [r, setR] = useState(initial);
  const exists = data.ricorrenze.some((x) => x.id === r.id);
  const set = (patch: Partial<Recurring>) => setR((x) => ({ ...x, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!r.descrizione.trim() || r.importo <= 0) return;
    saveRecurring({ ...r, descrizione: r.descrizione.trim() });
    onDone();
  };
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Descrizione" full>
          <input className="input" required autoFocus={!exists} value={r.descrizione} placeholder="Es. Netflix, visita dermatologica" onChange={(e) => set({ descrizione: e.target.value })} />
        </Field>
        <Field label="Importo (€)">
          <MoneyInput value={r.importo} onChange={(importo) => set({ importo })} />
        </Field>
        <Field label="Frequenza">
          <select className="input" value={r.frequenza} onChange={(e) => set({ frequenza: Number(e.target.value) as Frequency })}>
            {Object.entries(frequencyLabels).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Primo mese">
          <input className="input" type="month" required value={r.meseInizio} onChange={(e) => set({ meseInizio: e.target.value })} />
        </Field>
        <Field label="Ultimo mese" hint="Facoltativo, es. fine di una rata">
          <input className="input" type="month" value={r.meseFine ?? ''} onChange={(e) => set({ meseFine: e.target.value || undefined })} />
        </Field>
        <Field label="Giorno di addebito">
          <input className="input" type="number" min={1} max={31} value={r.giorno ?? ''} onChange={(e) => set({ giorno: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label="Categoria">
          <select className="input" value={r.categoriaId} onChange={(e) => set({ categoriaId: e.target.value })}>
            {data.categorie
              .filter((c) => !c.archiviata || c.id === r.categoriaId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </Field>
        <label className="check full">
          <input type="checkbox" checked={r.attiva} onChange={(e) => set({ attiva: e.target.checked })} />
          Attiva
        </label>
      </div>
      <p className="small muted">Le modifiche si applicano ai piani creati da ora in poi; nei piani esistenti usa "Aggiungi ricorrenze mancanti".</p>
      <div className="modal-foot">
        <div>
          {exists && (
            <ConfirmButton
              className="btn danger"
              question="Eliminare? Le spese già nei piani restano."
              confirmLabel="Elimina"
              onConfirm={() => {
                deleteRecurring(r.id);
                onDone();
              }}
            >
              Elimina
            </ConfirmButton>
          )}
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={onDone}>
            Annulla
          </button>
          <button type="submit" className="btn primary">
            Salva
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------- Categorie ----------

function CategoriesSection({ data }: { data: AppData }) {
  const [message, setMessage] = useState('');
  const update = (c: Category, patch: Partial<Category>) => saveCategory({ ...c, ...patch });
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Categorie</h2>
          <p>Per le tue spese personali. Essenziale = difficile da ridurre.</p>
        </div>
        <button type="button" className="btn small" onClick={() => saveCategory({ ...newCategory(), nome: 'Nuova categoria' })}>
          <Icon name="plus" /> Aggiungi
        </button>
      </div>
      <div className="rows">
        {data.categorie.map((c) => (
          <div key={c.id} className="inline-row" style={{ gridTemplateColumns: 'auto 1fr 130px auto', opacity: c.archiviata ? 0.55 : 1 }}>
            <select
              className="input compact"
              aria-label={`Colore ${c.nome}`}
              value={c.colore}
              style={{ width: 44, background: c.colore, color: 'transparent' }}
              onChange={(e) => update(c, { colore: e.target.value })}
            >
              {palette.map((p, i) => (
                <option key={p} value={p} style={{ background: p }}>
                  Colore {i + 1}
                </option>
              ))}
            </select>
            <input className="input compact" value={c.nome} aria-label="Nome categoria" onChange={(e) => update(c, { nome: e.target.value })} />
            <select className="input compact" value={c.tipo} aria-label={`Tipo ${c.nome}`} onChange={(e) => update(c, { tipo: e.target.value as Category['tipo'] })}>
              <option value="essenziale">Essenziale</option>
              <option value="discrezionale">Discrezionale</option>
            </select>
            {c.archiviata ? (
              <button type="button" className="btn small" onClick={() => update(c, { archiviata: false })}>
                Ripristina
              </button>
            ) : (
              <IconButton
                icon="trash"
                label={`Elimina ${c.nome}`}
                onClick={() => {
                  const result = deleteCategory(c.id);
                  setMessage(result === 'archiviata' ? `"${c.nome}" è già usata: è stata archiviata invece che eliminata.` : '');
                }}
              />
            )}
          </div>
        ))}
      </div>
      {message && (
        <div className="section-gap">
          <Notice>{message}</Notice>
        </div>
      )}
    </div>
  );
}

// ---------- Conti ----------

const accountTypes: Record<AccountType, string> = {
  cointestato: 'Cointestato',
  risparmio: 'Risparmio',
  investimenti: 'Investimenti',
  personale: 'Personale',
};

function AccountsSection({ data }: { data: AppData }) {
  const update = (a: Account, patch: Partial<Account>) => saveAccount({ ...a, ...patch });
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Conti</h2>
          <p>Dove finiscono le quote dello stipendio.</p>
        </div>
        <button type="button" className="btn small" onClick={() => saveAccount({ id: newId(), nome: 'Nuovo conto', tipo: 'personale' })}>
          <Icon name="plus" /> Aggiungi
        </button>
      </div>
      <div className="rows">
        {data.conti.map((a) => (
          <div key={a.id} className="inline-row" style={{ gridTemplateColumns: '1fr 130px auto' }}>
            <input className="input compact" value={a.nome} aria-label="Nome conto" onChange={(e) => update(a, { nome: e.target.value })} />
            <select className="input compact" value={a.tipo} aria-label={`Tipo ${a.nome}`} onChange={(e) => update(a, { tipo: e.target.value as AccountType })}>
              {Object.entries(accountTypes).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <ConfirmButton className="btn ghost icon" question="Eliminare il conto?" confirmLabel="Elimina" onConfirm={() => deleteAccount(a.id)}>
              <Icon name="trash" title={`Elimina ${a.nome}`} />
            </ConfirmButton>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Il tipo determina come le quote vengono contate nelle analisi (es. risparmio e investimenti entrano nel tasso di risparmio).
      </p>
    </div>
  );
}

// ---------- Generali ----------

function GeneralSection({ data }: { data: AppData }) {
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme());
  return (
    <div className="card">
      <h2 style={{ marginBottom: 14 }}>Generali</h2>
      <div className="form-grid">
        <Field label="Il tuo nome">
          <input className="input" value={data.settings.nome ?? ''} onChange={(e) => updateSettings((s) => void (s.nome = e.target.value || undefined))} />
        </Field>
        <Field label="Giorno dello stipendio" hint="Usato come data dei versamenti sugli obiettivi">
          <input
            className="input"
            type="number"
            min={1}
            max={31}
            value={data.settings.giornoStipendio}
            onChange={(e) => updateSettings((s) => void (s.giornoStipendio = Math.min(31, Math.max(1, Number(e.target.value) || 1))))}
          />
        </Field>
        <Field label="Tema">
          <Segmented<ThemeChoice>
            label="Tema"
            value={theme}
            onChange={(v) => {
              setTheme(v);
              setThemeState(v);
            }}
            options={[
              { value: 'sistema', label: 'Sistema' },
              { value: 'chiaro', label: 'Chiaro' },
              { value: 'scuro', label: 'Scuro' },
            ]}
          />
        </Field>
      </div>
    </div>
  );
}

// ---------- Dati ----------

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function transactionsCsv(data: AppData): string {
  const categories = new Map(data.categorie.map((c) => [c.id, c.nome]));
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [...data.movimenti]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((t) =>
      [t.data, escape(t.descrizione), escape(categories.get(t.categoriaId) ?? ''), (t.importo / 100).toFixed(2).replace('.', ','), t.previstaId ? 'pianificata' : 'estemporanea', escape(t.note ?? '')].join(';'),
    );
  return ['data;descrizione;categoria;importo;tipo;note', ...rows].join('\n');
}

// L'anteprima incorporata non può scaricare file: lì resta solo "Copia backup".
const canDownload = import.meta.env.VITE_AVVIO_DEMO !== '1';

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>I tuoi dati</h2>
          <p>Tutto è salvato solo in questo browser. Esporta un backup regolarmente, soprattutto prima di cambiare dispositivo.</p>
        </div>
      </div>
      <div className="actions">
        {canDownload && (
          <button type="button" className="btn" onClick={() => download(`salvadanaio-backup-${stamp}.json`, exportJson(), 'application/json')}>
            <Icon name="download" /> Esporta backup
          </button>
        )}
        <ConfirmButton question="I dati attuali verranno sostituiti." confirmLabel="Scegli file" onConfirm={() => fileRef.current?.click()}>
          <Icon name="upload" /> Importa backup
        </ConfirmButton>
        <button
          type="button"
          className="btn"
          onClick={() =>
            navigator.clipboard.writeText(exportJson()).then(
              () => setMessage({ kind: 'good', text: 'Backup copiato negli appunti: incollalo in un file .json per conservarlo.' }),
              () => setMessage({ kind: 'bad', text: 'Il browser non consente di copiare: usa "Esporta backup".' }),
            )
          }
        >
          <Icon name="copy" /> Copia backup
        </button>
        {canDownload && (
          <button type="button" className="btn" onClick={() => download(`salvadanaio-spese-${stamp}.csv`, transactionsCsv(getState()), 'text/csv')}>
            <Icon name="download" /> Spese in CSV
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              importJson(await file.text());
              setMessage({ kind: 'good', text: 'Backup importato.' });
            } catch (error) {
              setMessage({ kind: 'bad', text: `Import non riuscito: ${(error as Error).message}` });
            }
          }}
        />
      </div>
      <div className="actions section-gap">
        <ConfirmButton question="I dati attuali verranno sostituiti." confirmLabel="Carica" onConfirm={loadDemo}>
          Carica dati di esempio
        </ConfirmButton>
        <ConfirmButton className="btn danger" question="Cancellare tutti i dati? Non si può annullare." confirmLabel="Cancella" onConfirm={resetAll}>
          <Icon name="trash" /> Cancella tutto
        </ConfirmButton>
      </div>
      {message && (
        <div className="section-gap">
          <Notice kind={message.kind}>{message.text}</Notice>
        </div>
      )}
    </div>
  );
}
