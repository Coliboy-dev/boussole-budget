import Link from 'next/link';
import { Check } from 'lucide-react';
import Card from '@/components/ui/Card';
import { Icon } from '@/components/ui/icons';
import { formatShortDate, formatCurrency } from '@/lib/budget-calculations';
import type { Reminder } from '@/lib/types';

interface UpcomingDeadlinesProps {
  reminders: Reminder[];
  horizon: number;
  /** Enregistre le paiement d’une charge ou d’une mensualité et débite le solde. */
  onPay?: (reminder: Reminder) => void;
  payDisabled?: boolean;
}

const payable = (reminder: Reminder) => (reminder.type === 'expense' || reminder.type === 'debt') && Boolean(reminder.refId);

export default function UpcomingDeadlines({ reminders, horizon, onPay, payDisabled = false }: UpcomingDeadlinesProps) {
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
              <div className="flex shrink-0 items-center gap-2">
                {reminder.amount !== undefined && (
                  <span className="text-sm font-semibold text-gray-800 tabular-nums">
                    {formatCurrency(reminder.amount)}
                  </span>
                )}
                {onPay && payable(reminder) && (
                  <button
                    type="button"
                    id={`pay-home-${reminder.id}`}
                    disabled={payDisabled}
                    onClick={() => onPay(reminder)}
                    aria-label={`Marquer ${reminder.label} du ${formatShortDate(reminder.dueDate)} comme payé`}
                    className="inline-flex items-center gap-1 rounded-xl border border-teal-700 px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-500"
                  >
                    <Icon icon={Check} className="size-4" />
                    Payé
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {onPay && upcoming.some(payable) && (
        <p className="mt-1 text-xs text-gray-600">« Payé » déduit le montant de ton solde.</p>
      )}
      {lateCount > 0 && (
        <Link href="/projection#en-retard" className="inline-flex min-h-11 items-center text-xs font-medium text-red-800 underline">
          {lateCount} {lateCount === 1 ? 'échéance en retard' : 'échéances en retard'}
        </Link>
      )}
    </Card>
  );
}
