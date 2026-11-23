import Link from 'next/link';
import { Baby, CalendarDays, Check, ChevronRight, Landmark, Scale, TriangleAlert, Wallet, type LucideIcon } from 'lucide-react';
import { Icon } from '@/components/ui/icons';
import { formatShortDate, formatCurrency } from '@/lib/budget-calculations';
import { selectUpcomingPaymentReminders } from '@/lib/payment-reminders';
import { usePaymentReminders } from '@/lib/use-payment-reminders';
import type { Reminder } from '@/lib/types';

interface UpcomingDeadlinesProps {
  reminders: Reminder[];
  today: string;
  horizon: number;
  /** Enregistre le paiement d’une charge ou d’une mensualité et débite le solde. */
  onPay?: (reminder: Reminder) => void;
  payDisabled?: boolean;
}

const payable = (reminder: Reminder) => (reminder.type === 'expense' || reminder.type === 'debt') && Boolean(reminder.refId);

// Même code couleur que l'écran Échéances : charge en ambre, mensualité en mauve, entrée en teal.
const kinds: Record<Reminder['type'], { label: string; icon: LucideIcon; tile: string }> = {
  expense: { label: 'Charge', icon: CalendarDays, tile: 'bg-cap-warning-soft text-cap-warning-text' },
  debt: { label: 'Mensualité', icon: Landmark, tile: 'bg-cap-secondary-soft text-cap-secondary-text' },
  mediation: { label: 'Médiation', icon: Scale, tile: 'bg-cap-secondary-soft text-cap-secondary-text' },
  child: { label: 'Enfant', icon: Baby, tile: 'bg-cap-surface-soft text-cap-primary-text' },
  income: { label: 'Revenu', icon: Wallet, tile: 'bg-cap-surface-soft text-cap-primary-text' },
};

export default function UpcomingDeadlines({ reminders, today, horizon, onPay, payDisabled = false }: UpcomingDeadlinesProps) {
  const remindersEnabled = usePaymentReminders();
  const upcoming = selectUpcomingPaymentReminders(reminders, today, remindersEnabled);
  const lateCount = reminders.filter(({ isLate }) => isLate).length;

  return (
    <section aria-labelledby="home-upcoming-heading" className="rounded-[19px] border border-cap-border bg-cap-surface px-4 pt-4 pb-2 shadow-[0_1px_2px_rgba(23,44,55,0.04)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="home-upcoming-heading" className="text-sm font-bold text-cap-text">Prochaines échéances</h2>
        <Link href="/projection" className="inline-flex min-h-11 items-center gap-0.5 text-xs font-semibold text-cap-primary-text underline">
          Voir l’échéancier
          <Icon icon={ChevronRight} className="size-3.5" />
        </Link>
      </div>
      {lateCount > 0 && (
        <Link href="/projection#en-retard"
          className="mb-1 flex min-h-11 items-center gap-2 rounded-xl bg-cap-warning-soft px-3 text-xs font-semibold text-cap-warning-text underline">
          <Icon icon={TriangleAlert} className="size-4 shrink-0" />
          {lateCount} {lateCount === 1 ? 'échéance en retard' : 'échéances en retard'}
        </Link>
      )}
      {upcoming.length === 0 ? (
        <p className="py-3 text-sm text-cap-text-muted">Aucune échéance prévue dans les {horizon} prochains jours.</p>
      ) : (
        <ul className="divide-y divide-cap-border">
          {upcoming.map(({ reminder, remindTomorrow }) => {
            const kind = kinds[reminder.type];
            return (
              <li key={reminder.id} className="flex items-center gap-3 py-3">
                <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-xl ${kind.tile}`}>
                  <Icon icon={kind.icon} className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="wrap-break-word text-sm font-semibold text-cap-text">{reminder.label}</p>
                  <p className="text-xs text-cap-text-muted">
                    <time dateTime={reminder.dueDate} className={remindTomorrow ? 'font-semibold text-cap-warning-text' : undefined}>
                      {remindTomorrow ? 'À payer demain' : formatShortDate(reminder.dueDate)}
                    </time>
                    {' · '}{kind.label}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  {reminder.amount !== undefined && (
                    <span className="text-sm font-bold tabular-nums text-cap-text">{formatCurrency(reminder.amount)}</span>
                  )}
                  {onPay && payable(reminder) && (
                    <button
                      type="button"
                      id={`pay-home-${reminder.id}`}
                      disabled={payDisabled}
                      onClick={() => onPay(reminder)}
                      aria-label={`Marquer ${reminder.label} du ${formatShortDate(reminder.dueDate)} comme payé`}
                      className="inline-flex items-center gap-1 rounded-xl border border-cap-primary px-3 text-sm font-semibold text-cap-primary-text hover:bg-cap-surface-soft disabled:cursor-not-allowed disabled:border-cap-border disabled:text-cap-text-muted"
                    >
                      <Icon icon={Check} className="size-4" />
                      Payé
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {onPay && upcoming.some(({ reminder }) => payable(reminder)) && (
        <p className="pb-2 text-xs text-cap-text-muted">« Payé » déduit le montant de ton solde.</p>
      )}
    </section>
  );
}
