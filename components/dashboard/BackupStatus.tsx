import Link from 'next/link';
import { formatDate } from '@/lib/budget-calculations';
import { daysBetween } from '@/lib/local-date';

const BACKUP_REMINDER_DAYS = 7;

interface Props {
  lastBackupDate: string | null;
  today: string;
  hasBudget: boolean;
}

export default function BackupStatus({ lastBackupDate, today, hasBudget }: Props) {
  const date = lastBackupDate && lastBackupDate <= today ? lastBackupDate : null;
  const remind = hasBudget && (!date || daysBetween(date, today) >= BACKUP_REMINDER_DAYS);

  return (
    <section
      aria-labelledby="backup-status-title"
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[19px] border px-4 py-3 ${remind ? 'border-cap-warning-text/25 bg-cap-warning-soft' : 'border-cap-border bg-cap-surface'}`}
    >
      <div>
        <h2 id="backup-status-title" className="text-sm font-semibold text-cap-text">Dernière sauvegarde exportée</h2>
        <p className="text-xs text-cap-text-muted">
          {date ? <time dateTime={date}>{formatDate(date)}</time> : 'Aucun export enregistré'}
        </p>
        {remind && (
          <p className="mt-1 text-xs font-medium text-cap-warning-text">
            {date ? 'Pense à exporter une nouvelle copie de ton budget.' : 'Pense à exporter une première copie de ton budget.'}
          </p>
        )}
      </div>
      <Link href="/sauvegarde" aria-label="Sauvegarder ou restaurer le budget"
        className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold text-cap-primary-text underline">
        Sauvegarder
      </Link>
    </section>
  );
}
