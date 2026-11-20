import Link from 'next/link';
import Card from '@/components/ui/Card';
import { formatShortDate, formatCurrency } from '@/lib/budget-calculations';
import type { Reminder } from '@/lib/types';

interface UpcomingDeadlinesProps {
  reminders: Reminder[];
  horizon: number;
}

export default function UpcomingDeadlines({ reminders, horizon }: UpcomingDeadlinesProps) {
  const upcoming = reminders.filter(({ isLate }) => !isLate).slice(0, 3);
  const lateCount = reminders.filter(({ isLate }) => isLate).length;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Prochaines échéances</h2>
        <Link href="/projection" className="inline-flex min-h-11 items-center text-xs font-medium text-teal-800 underline">Voir l’échéancier</Link>
      </div>
      {upcoming.length === 0 ? (
        <p className="mt-3 text-sm text-gray-600">Aucune échéance prévue dans les {horizon} prochains jours.</p>
      ) : (
        <ul className="mt-1 divide-y divide-gray-100">
          {upcoming.map((reminder) => (
            <li key={reminder.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="wrap-break-word text-sm font-medium text-gray-800">{reminder.label}</p>
                <time dateTime={reminder.dueDate} className="text-xs text-gray-600">
                  {formatShortDate(reminder.dueDate)}
                </time>
              </div>
              {reminder.amount !== undefined && (
                <span className="shrink-0 text-sm font-semibold text-gray-800 tabular-nums">
                  {formatCurrency(reminder.amount)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {lateCount > 0 && (
        <Link href="/projection#en-retard" className="inline-flex min-h-11 items-center text-xs font-medium text-red-800 underline">
          {lateCount} {lateCount === 1 ? 'échéance en retard' : 'échéances en retard'}
        </Link>
      )}
    </Card>
  );
}
