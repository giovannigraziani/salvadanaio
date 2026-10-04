import { useEffect, useRef, useState, type FormEvent } from 'react';
import { accountTypeLabels } from '../domain/defaults';
import { myName, ownerName, people } from '../domain/ledger';
import type { AccountType, AppData } from '../domain/types';
import { addAccount, deleteAccount, importJson, loadDemo, moveAccount, resetAll, setMyName, updateAccount } from '../store/actions';
import { getState, useData } from '../store/store';
import { canDownload, copyBackup, daysSinceBackup, download, downloadBackup, transactionsCsv } from '../ui/backup';
import { ConfirmButton, Field, IconButton, Link, Notice, Segmented } from '../ui/components';
import { isInstalled, requestPersistentStorage, storageStatus, type StorageStatus } from '../ui/device';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { getTheme, setTheme, type ThemeChoice } from '../ui/theme';

export function Impostazioni() {
  const data = useData();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Impostazioni</h1>
          <p>I tuoi conti, le preferenze e il backup dei dati. Modello, ricorrenze e categorie di ogni conto sono nella sua scheda, in Piano → Modello.</p>
        </div>
      </div>
      <div className="stack">
        <AccountsSection data={data} />
        <GeneralSection data={data} />
        <DataSection data={data} />
      </div>
    </>
  );
}

// ---------- Conti ----------

function AccountsSection({ data }: { data: AppData }) {
  const [tipo, setTipo] = useState<AccountType>('personale');
  const [nome, setNome] = useState('');
  const [titolare, setTitolare] = useState('');
  const owner = titolare.trim() || (tipo === 'personale' ? '' : myName(data));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const label = nome.trim() || (tipo === 'personale' && owner ? `Conto di ${owner}` : accountTypeLabels[tipo]);
    const id = addAccount(tipo, label, tipo === 'cointestato' ? undefined : owner || undefined);
    setNome('');
    setTitolare('');
    navigate(`conto/${id}/modello`);
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Conti</h2>
          <p>Ogni conto ha la sua scheda con piano, spese e analisi. Il primo conto personale è quello predefinito per le nuove spese.</p>
        </div>
      </div>
      <ul className="list">
        {data.conti.map((a, i) => (
          <li key={a.id} className="list-item wrap-mobile" style={{ opacity: a.archiviato ? 0.55 : 1 }}>
            <div className="grow">
              <div className="title">
                {a.nome} <span className="badge">{accountTypeLabels[a.tipo]}</span> {a.archiviato && <span className="badge">archiviato</span>}
              </div>
              <div className="sub">
                {a.tipo === 'cointestato' ? 'Condiviso · ' : `${ownerName(a)} · `}
                {Object.keys(a.piani).length} piani mensili · {a.movimenti.length} spese
              </div>
            </div>
            <IconButton icon="up" label={`Sposta su ${a.nome}`} onClick={() => moveAccount(a.id, -1)} className={i === 0 ? 'hidden-btn' : ''} />
            <IconButton icon="down" label={`Sposta giù ${a.nome}`} onClick={() => moveAccount(a.id, 1)} className={i === data.conti.length - 1 ? 'hidden-btn' : ''} />
            <Link className="btn small" to={`conto/${a.id}/modello`}>
              Modello
            </Link>
            <button type="button" className="btn small" onClick={() => updateAccount(a.id, { archiviato: !a.archiviato })}>
              {a.archiviato ? 'Ripristina' : 'Archivia'}
            </button>
            <ConfirmButton className="btn small danger" question="Eliminare il conto con piani e spese?" confirmLabel="Elimina" onConfirm={() => deleteAccount(a.id)}>
              Elimina
            </ConfirmButton>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="section-gap">
        <h3 style={{ marginBottom: 8 }}>Aggiungi un conto</h3>
        <div className="form-grid">
          <Field label="Tipo">
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as AccountType)}>
              {Object.entries(accountTypeLabels).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {tipo !== 'cointestato' && (
            <Field label="Di chi è" hint={tipo === 'personale' ? 'Es. il nome della tua compagna' : `Vuoto = ${myName(data)}`}>
              <input className="input" list="persone" value={titolare} placeholder={tipo === 'personale' ? 'Nome' : myName(data)} onChange={(e) => setTitolare(e.target.value)} />
              <datalist id="persone">
                {people(data).map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
          )}
          {tipo !== 'personale' && (
            <Field label="Nome del conto" full={tipo === 'cointestato'}>
              <input
                className="input"
                value={nome}
                placeholder={tipo === 'risparmio' ? 'Es. Conto deposito' : tipo === 'investimenti' ? 'Es. Conto titoli, PAC' : 'Es. Conto di casa'}
                onChange={(e) => setNome(e.target.value)}
              />
            </Field>
          )}
        </div>
        <div className="actions section-gap">
          <button type="submit" className="btn primary">
            <Icon name="plus" /> Aggiungi conto
          </button>
          <span className="small muted">
            {tipo === 'personale'
              ? 'Avrà le categorie delle spese personali e parteciperà al conto cointestato.'
              : tipo === 'cointestato'
                ? 'I conti personali esistenti diventano partecipanti: la regola la scegli nel modello.'
                : tipo === 'investimenti'
                  ? 'Riceve le quote degli altri conti; puoi registrare il valore di mercato per vedere il rendimento.'
                  : 'Riceve le quote degli altri conti e può ospitare obiettivi.'}
          </span>
        </div>
      </form>
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
        <Field label="Il tuo nome" hint="Sei il titolare dei conti con questo nome; la dashboard parte dai tuoi conti">
          <input className="input" defaultValue={myName(data)} onBlur={(e) => e.target.value.trim() !== myName(data) && setMyName(e.target.value)} />
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

const storageLabels: Record<StorageStatus, string> = {
  protetto: 'Archivio protetto: il browser non cancellerà i dati per liberare spazio.',
  'non-protetto': 'Archivio non protetto: il browser potrebbe cancellare i dati se manca spazio o se non usi l’app per molto tempo.',
  'non-supportato': 'Questo browser non permette di proteggere l’archivio.',
};

function DataSection({ data }: { data: AppData }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const days = daysSinceBackup(data);

  useEffect(() => {
    void storageStatus().then(setStorage);
  }, []);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>I tuoi dati</h2>
          <p>Tutto è salvato solo in questo browser. Esporta un backup regolarmente, soprattutto prima di cambiare dispositivo.</p>
        </div>
      </div>

      <div className="rows small">
        <div>
          {data.settings.ultimoBackup ? `Ultimo backup: ${days === 0 ? 'oggi' : `${days} giorni fa`}.` : 'Non hai ancora fatto un backup.'} Un promemoria compare in
          dashboard se passano più di 30 giorni.
        </div>
        {storage && (
          <div className="actions">
            <span>{storageLabels[storage]}</span>
            {storage === 'non-protetto' && (
              <button type="button" className="btn small" onClick={() => void requestPersistentStorage().then(setStorage)}>
                Proteggi l'archivio
              </button>
            )}
          </div>
        )}
        <div>
          {isInstalled()
            ? 'App installata: si apre anche senza connessione.'
            : 'Aggiungi l’app alla schermata Home per aprirla come un’app (su iPhone evita anche che Safari cancelli i dati dopo 7 giorni senza visite). Dopo la prima apertura funziona anche senza connessione.'}
        </div>
      </div>

      <div className="actions section-gap">
        {canDownload && (
          <button type="button" className="btn" onClick={downloadBackup}>
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
            void copyBackup().then((ok) =>
              setMessage(
                ok
                  ? { kind: 'good', text: 'Backup copiato negli appunti: incollalo in un file .json per conservarlo.' }
                  : { kind: 'bad', text: 'Il browser non consente di copiare: usa "Esporta backup".' },
              ),
            )
          }
        >
          <Icon name="copy" /> Copia backup
        </button>
        {canDownload && (
          <button type="button" className="btn" onClick={() => download(`salvadanaio-spese-${new Date().toISOString().slice(0, 10)}.csv`, transactionsCsv(getState()), 'text/csv')}>
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
