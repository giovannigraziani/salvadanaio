import { useData } from '../store/store';
import { BACKUP_REMINDER_DAYS, canDownload, daysSinceBackup, downloadBackup } from './backup';
import { Link, Notice } from './components';

/** Avviso quando l'ultimo backup è più vecchio di un mese. */
export function BackupReminder() {
  const data = useData();
  const days = daysSinceBackup(data);
  if (data.settings.datiDiEsempio || days === undefined || days < BACKUP_REMINDER_DAYS) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <Notice kind="warn">
        {data.settings.ultimoBackup ? `L'ultimo backup è di ${days} giorni fa.` : 'Non hai ancora esportato un backup.'} I dati vivono solo in questo browser:
        conservane una copia.{' '}
        {canDownload ? (
          <button type="button" className="btn small" onClick={downloadBackup}>
            Esporta backup
          </button>
        ) : (
          <Link className="btn small" to="impostazioni">
            Vai al backup
          </Link>
        )}
      </Notice>
    </div>
  );
}
