import { accountTypeLabels } from '../../domain/defaults';
import { activeAccounts, averageNeed, participants, people, shares, splitAmount, splitRuleLabels } from '../../domain/ledger';
import { formatEuro, sum } from '../../domain/money';
import { monthlyEquivalent } from '../../domain/schedule';
import type { Account, AccountType, AppData, PlanTemplate, SplitRule } from '../../domain/types';
import { deleteCategory, deleteRecurring, saveCategory, saveRecurring, updateAccount, updateTemplate } from '../../store/actions';
import { CategoryDot, Field, MoneyInput, Notice } from '../../ui/components';
import { IncomeEditor, TransferEditor } from '../../ui/editors';
import { CategoriesSection, RecurringSection } from '../../ui/listEditors';

const roundingOptions = [
  { value: 1, label: 'Al centesimo' },
  { value: 100, label: '1 €' },
  { value: 500, label: '5 €' },
  { value: 1000, label: '10 €' },
  { value: 5000, label: '50 €' },
];

/** Il "preset" del conto: impostazioni, entrate, quote, budget, ricorrenze e categorie da cui nasce ogni piano mensile. */
export function ModelloView({ data, account }: { data: AppData; account: Account }) {
  const t = account.modello;
  const edit = (recipe: (draft: PlanTemplate) => void) => updateTemplate(account.id, (m) => recipe(m));
  const entrate = sum(t.entrate, (e) => e.importo);
  // Quote che gli altri conti versano qui secondo i loro modelli.
  const inArrivo = sum(
    data.conti.filter((a) => a.id !== account.id),
    (a) => sum(a.modello.trasferimenti.filter((x) => x.contoId === account.id), (x) => x.importo),
  );
  const quote = sum(t.trasferimenti, (x) => x.importo);
  const budget = sum(Object.values(t.budget), (b) => b);
  // Fabbisogno medio: il budget di ogni categoria o, se più alto, il costo mensile delle sue ricorrenze.
  const fabbisogno = averageNeed(account);
  const ricorrenti = sum(account.ricorrenze.filter((r) => r.attiva), monthlyEquivalent);
  const libero = entrate + inArrivo - quote - fabbisogno;
  const isPersonal = account.tipo === 'personale';

  return (
    <div className="stack">
      <p className="muted small" style={{ marginTop: 0 }}>
        Il modello è il punto di partenza di ogni nuovo piano mensile di questo conto. Le modifiche valgono per i piani creati da ora in poi.
      </p>

      <AccountSettings data={data} account={account} />

      {account.tipo === 'cointestato' && <SplitSettings data={data} account={account} />}

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Entrate e quote</h2>
            <p>Cosa entra ogni mese e quanto versi su altri conti o obiettivi.</p>
          </div>
        </div>
        <div className="grid grid-2">
          <div>
            <h3 style={{ marginBottom: 8 }}>Entrate proprie</h3>
            <IncomeEditor
              lines={t.entrate}
              onChange={(i, patch) => edit((d) => (patch === null ? d.entrate.splice(i, 1) : Object.assign(d.entrate[i]!, patch)))}
              onAdd={() => edit((d) => d.entrate.push({ descrizione: isPersonal ? 'Stipendio' : 'Entrata', importo: 0 }))}
            />
            {inArrivo > 0 && <p className="small muted">In più arrivano {formatEuro(inArrivo)} al mese da altri conti, secondo i loro modelli.</p>}
          </div>
          <div>
            <h3 style={{ marginBottom: 8 }}>Quote verso altri conti e obiettivi</h3>
            <TransferEditor
              lines={t.trasferimenti}
              conti={activeAccounts(data).filter((a) => a.id !== account.id)}
              obiettivi={data.obiettivi}
              onChange={(i, patch) => edit((d) => (patch === null ? d.trasferimenti.splice(i, 1) : Object.assign(d.trasferimenti[i]!, patch)))}
              onAdd={() => edit((d) => d.trasferimenti.push({ descrizione: 'Nuova quota', importo: 0 }))}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Budget per categoria</h2>
            <p>Quanto ti concedi ogni mese. Nel piano il budget sale da solo se le spese previste del mese lo superano.</p>
          </div>
        </div>
        {account.categorie.filter((c) => !c.archiviata).length === 0 ? (
          <p className="muted">Nessuna categoria: aggiungine una qui sotto.</p>
        ) : (
          <div className="rows">
            {account.categorie
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
                      edit((d) => {
                        if (v) d.budget[c.id] = v;
                        else delete d.budget[c.id];
                      })
                    }
                  />
                </div>
              ))}
          </div>
        )}
        <div className="section-gap">
          <Notice kind={libero < 0 ? 'bad' : 'info'}>
            Entrate {formatEuro(entrate + inArrivo)} − quote {formatEuro(quote)} − spese previste in media {formatEuro(fabbisogno)} ={' '}
            <strong className={libero < 0 ? 'text-bad' : undefined}>{formatEuro(libero)} non allocati</strong> al mese.
            {fabbisogno > budget &&
              ` Le spese ricorrenti (${formatEuro(ricorrenti)} al mese in media) superano il budget di alcune categorie: nel piano di ogni mese il budget viene alzato per coprirle.`}
          </Notice>
        </div>
      </div>

      <RecurringSection
        ricorrenze={account.ricorrenze}
        categorie={account.categorie}
        onSave={(r) => saveRecurring(account.id, r)}
        onDelete={(id) => deleteRecurring(account.id, id)}
        title="Spese ricorrenti"
        description={
          account.tipo === 'cointestato'
            ? 'Affitto, bollette, internet, condominio: entrano da sole nel piano dei mesi giusti.'
            : 'Abbonamenti, rate, visite periodiche (anche settimanali o a settimane alterne): entrano da sole nel piano dei mesi giusti.'
        }
        placeholder={account.tipo === 'cointestato' ? 'Es. affitto, bolletta luce e gas' : 'Es. fisioterapia, abbonamento palestra'}
      />
      <CategoriesSection
        categorie={account.categorie}
        onSave={(c) => saveCategory(account.id, c)}
        onDelete={(id) => deleteCategory(account.id, id)}
        title="Categorie"
        description="Essenziale = difficile da ridurre; discrezionale = spesa su cui si può agire."
      />
    </div>
  );
}

function AccountSettings({ data, account }: { data: AppData; account: Account }) {
  const set = (patch: Partial<Account>) => updateAccount(account.id, patch);
  return (
    <div className="card">
      <h2 style={{ marginBottom: 12 }}>Impostazioni del conto</h2>
      <div className="form-grid">
        <Field label="Nome del conto">
          <input className="input" value={account.nome} onChange={(e) => set({ nome: e.target.value })} />
        </Field>
        <Field label="Tipo">
          <select className="input" value={account.tipo} onChange={(e) => set({ tipo: e.target.value as AccountType })}>
            {Object.entries(accountTypeLabels).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {account.tipo !== 'cointestato' && (
          <Field label="Titolare" hint="A chi appartiene il conto: la dashboard raggruppa i conti per persona">
            <input className="input" list="persone-conto" value={account.titolare ?? ''} onChange={(e) => set({ titolare: e.target.value || undefined })} />
            <datalist id="persone-conto">
              {people(data).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
        )}
        {account.tipo === 'personale' && (
          <>
            <Field label="Giorno dello stipendio" hint="Da questo giorno lo stipendio conta nel saldo">
              <input
                className="input"
                type="number"
                min={1}
                max={31}
                value={account.giornoStipendio ?? 27}
                onChange={(e) => set({ giornoStipendio: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
              />
            </Field>
          </>
        )}
        <Field label="Saldo iniziale (€)" hint="Quanto c'era sul conto all'inizio del mese indicato">
          <MoneyInput value={account.saldoIniziale} onChange={(saldoIniziale) => set({ saldoIniziale })} />
        </Field>
        <Field label="All'inizio di">
          <input className="input" type="month" value={account.meseSaldoIniziale} onChange={(e) => e.target.value && set({ meseSaldoIniziale: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

/** Regola con cui i partecipanti si dividono le spese di un conto condiviso. */
function SplitSettings({ data, account }: { data: AppData; account: Account }) {
  const split = account.ripartizione ?? { regola: 'paritaria' as SplitRule, partecipanti: [], percentuali: {}, arrotondamento: 1000 };
  const set = (patch: Partial<typeof split>) => updateAccount(account.id, { ripartizione: { ...split, ...patch } });
  const candidates = activeAccounts(data).filter((a) => a.id !== account.id && a.tipo === 'personale');
  const list = participants(data, account);
  const s = shares(data, account);
  const need = averageNeed(account);
  const preview = splitAmount(data, account, need);

  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>Come vi dividete le spese</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Ogni mese la regola calcola quanto deve versare ciascun conto per coprire il budget del mese. Nel piano, "Allinea alle quote" aggiorna i versamenti.
      </p>
      <div className="form-grid">
        <Field label="Regola di ripartizione">
          <select className="input" value={split.regola} onChange={(e) => set({ regola: e.target.value as SplitRule })}>
            {Object.entries(splitRuleLabels).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Arrotonda le quote per eccesso a">
          <select className="input" value={split.arrotondamento} onChange={(e) => set({ arrotondamento: Number(e.target.value) })}>
            {roundingOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <h3 style={{ margin: '16px 0 8px' }}>Chi partecipa</h3>
      <ul className="list">
        {candidates.map((a) => {
          const on = split.partecipanti.includes(a.id);
          const income = sum(a.modello.entrate, (e) => e.importo);
          return (
            <li key={a.id} className="list-item wrap-mobile">
              <label className="check grow">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => set({ partecipanti: e.target.checked ? [...split.partecipanti, a.id] : split.partecipanti.filter((id) => id !== a.id) })}
                />
                <span>
                  <strong>{a.nome}</strong>
                  {split.regola === 'proporzionale' && <span className="small muted"> · entrate del modello {formatEuro(income)}</span>}
                </span>
              </label>
              {on && split.regola === 'percentuale' && (
                <span className="actions" style={{ flexWrap: 'nowrap' }}>
                  <input
                    className="input compact money"
                    style={{ width: 80 }}
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`Percentuale ${a.nome}`}
                    value={split.percentuali[a.id] ?? 0}
                    onChange={(e) => set({ percentuali: { ...split.percentuali, [a.id]: Math.max(0, Number(e.target.value) || 0) } })}
                  />
                  %
                </span>
              )}
              {on && <span className="badge accent">{Math.round((s[a.id] ?? 0) * 100)}%</span>}
            </li>
          );
        })}
      </ul>
      {candidates.length < 2 && (
        <p className="small muted">Per dividere le spese con un'altra persona aggiungi il suo conto personale dalle Impostazioni.</p>
      )}
      {list.length > 0 && (
        <div className="section-gap">
          <Notice>
            Con un fabbisogno medio di {formatEuro(need)} al mese (budget del modello più spese ricorrenti):{' '}
            {list.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                {a.titolare || a.nome} versa <strong>{formatEuro(preview[a.id] ?? 0)}</strong>
              </span>
            ))}
            .
          </Notice>
        </div>
      )}
    </div>
  );
}
