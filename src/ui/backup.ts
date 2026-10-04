import { activeAccounts } from '../domain/ledger';
import { dayNumber, today } from '../domain/month';
import type { AppData } from '../domain/types';
import { exportJson, markBackup } from '../store/actions';

/** L'anteprima incorporata in una pagina di claude.ai non può scaricare file. */
export const canDownload = import.meta.env.VITE_AVVIO_DEMO !== '1';

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Scarica il backup completo e ricorda la data per il promemoria. */
export function downloadBackup() {
  download(`salvadanaio-backup-${today()}.json`, exportJson(), 'application/json');
  markBackup();
}

export async function copyBackup(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(exportJson());
    markBackup();
    return true;
  } catch {
    return false;
  }
}

/** Tutte le spese di tutti i conti in CSV (separatore ";", importi con la virgola, per Excel in italiano). */
export function transactionsCsv(data: AppData): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = activeAccounts(data).flatMap((a) => {
    const categories = new Map(a.categorie.map((c) => [c.id, c.nome]));
    return a.movimenti.map((t) => ({
      data: t.data,
      line: [
        t.data,
        escape(a.nome),
        escape(t.descrizione),
        escape(categories.get(t.categoriaId) ?? ''),
        (t.importo / 100).toFixed(2).replace('.', ','),
        t.previstaId ? 'pianificata' : 'estemporanea',
        escape(t.note ?? ''),
      ].join(';'),
    }));
  });
  rows.sort((a, b) => a.data.localeCompare(b.data));
  return ['data;conto;descrizione;categoria;importo;tipo;note', ...rows.map((r) => r.line)].join('\n');
}

/** Giorni dall'ultimo backup (o dal primo utilizzo se non ce n'è mai stato uno). */
export function daysSinceBackup(data: AppData): number | undefined {
  const since = data.settings.ultimoBackup ?? data.settings.primoUtilizzo;
  return since ? dayNumber(today()) - dayNumber(since) : undefined;
}

export const BACKUP_REMINDER_DAYS = 30;
