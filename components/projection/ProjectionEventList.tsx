import Image from 'next/image';
import { ArrowDownLeft, Baby, CalendarDays, CircleCheck, Landmark, PiggyBank, TriangleAlert, Wallet, type LucideIcon } from 'lucide-react';
import { formatCurrency, formatDate, formatShortDate } from '@/lib/budget-calculations';
import type { ProjectionEvent } from '@/lib/projection';
import { Icon } from '@/components/ui/icons';

const eventKinds: Record<ProjectionEvent['type'], { label: string; icon: LucideIcon; tile: string }> = {
  income: { label: 'Revenu', icon: ArrowDownLeft, tile: 'bg-cap-surface-soft text-cap-primary-text' },
  expense: { label: 'Charge', icon: CalendarDays, tile: 'bg-cap-warning-soft text-cap-warning-text' },
  child: { label: 'Remboursement enfant', icon: Baby, tile: 'bg-cap-surface-soft text-cap-primary-text' },
  debt: { label: 'Mensualité', icon: Landmark, tile: 'bg-cap-secondary-soft text-cap-secondary-text' },
  envelope: { label: 'Enveloppe', icon: Wallet, tile: 'bg-cap-warning-soft text-cap-warning-text' },
  goal: { label: 'Objectif', icon: PiggyBank, tile: 'bg-cap-surface-soft text-cap-primary-text' },
};

/** Montant signé comme l’ancien écran : « +200,00 € » pour une entrée, « -650,00 € » pour une sortie. */
function signedAmount(amount: number): string {
  return `${amount > 0 ? '+' : ''}${formatCurrency(amount)}`;
}

interface Props {
  events: ProjectionEvent[];
  today: string;
  horizon: number;
  onPay: (event: ProjectionEvent) => void;
  storageBlocked: boolean;
}

export default function ProjectionEventList({ events, today, horizon, onPay, storageBlocked }: Props) {
  const late = events.filter((event) => event.isLate);
  const upcoming = events.filter((event) => !event.isLate);
  const days = new Map<string, ProjectionEvent[]>();
  for (const event of upcoming) days.set(event.dueDate, [...days.get(event.dueDate) ?? [], event]);

  function renderEvent(event: ProjectionEvent) {
    const payable = event.amount < 0 && (event.type === 'expense' || event.type === 'debt');
    const kind = eventKinds[event.type];

    return (
      <li key={event.id} className="flex items-center gap-3 py-3">
        <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-xl ${kind.tile}`}>
          <Icon icon={kind.icon} className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="wrap-break-word text-sm font-semibold text-cap-text">{event.label}</p>
          <p className="text-xs text-cap-text-muted">
            {event.isLate && (
              event.dueDate === today
                ? 'Date non renseignée · '
                : <><time dateTime={event.dueDate}>{formatShortDate(event.dueDate)}</time>{' · '}</>
            )}
            {kind.label}
            {event.isEstimated && ' · Montant incertain'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <span className={`text-sm font-bold tabular-nums ${event.amount > 0 ? 'text-cap-success-text' : 'text-cap-text'}`}>
            {signedAmount(event.amount)}
          </span>
          {payable && (
            <button
              type="button"
              id={`pay-${event.id}`}
              aria-label={`Payé — ${event.label}`}
              onClick={() => onPay(event)}
              disabled={storageBlocked}
              className="min-h-11 min-w-14 rounded-xl bg-cap-primary px-3 text-sm font-semibold text-cap-on-primary hover:bg-cap-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cap-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              Payé
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-3">
      <section id="en-retard" tabIndex={-1} aria-labelledby="late-heading"
        className={`scroll-mt-4 rounded-[19px] border px-4 ${late.length > 0 ? 'border-cap-warning-text/25 bg-cap-warning-soft py-3' : 'border-cap-border bg-cap-surface py-2'}`}>
        <h2 id="late-heading" className={`flex items-center gap-2 text-sm font-semibold ${late.length > 0 ? 'text-cap-warning-text' : 'text-cap-text'}`}>
          <Icon icon={late.length > 0 ? TriangleAlert : CircleCheck}
            className={`size-4 shrink-0 ${late.length > 0 ? '' : 'text-cap-success-text'}`} />
          En retard
          {late.length === 0 && <span className="font-normal text-cap-text-muted"> · Aucune échéance en retard.</span>}
        </h2>
        {late.length > 0 && (
          <>
            <p className="mt-1 text-xs leading-relaxed text-cap-text">
              Ces échéances sont passées sans être marquées payées. La projection les compte aujourd’hui :
              marque-les payées si c’est déjà fait.
            </p>
            <ul className="mt-2 divide-y divide-cap-border rounded-2xl bg-cap-surface px-3">
              {late.map(renderEvent)}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="upcoming-heading" className="rounded-[19px] border border-cap-border bg-cap-surface pt-4 pb-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4">
          <h2 id="upcoming-heading" className="text-sm font-bold text-cap-text">Prochaines échéances</h2>
          <span className="rounded-full bg-cap-surface-soft px-2 py-1 text-xs font-bold text-cap-primary-text">
            {upcoming.length} sur {horizon} jours
          </span>
        </div>
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 pt-3 pb-4 text-center">
            <div className="w-full max-w-60 overflow-hidden rounded-2xl bg-[#FEF5F1]">
              <Image src="/illustrations/echeances-calendrier-720.webp" alt="" width={720} height={540} unoptimized className="h-auto w-full" />
            </div>
            <p className="text-sm text-cap-text-muted">Aucune échéance à venir sur cette période.</p>
          </div>
        ) : (
          // Une journée par groupe : la date se lit une fois, en bandeau, même avec 15 à 20 opérations.
          <div className="mt-3">
            {[...days].map(([date, items]) => (
              <section key={date} data-day={date} aria-labelledby={`day-${date}`}>
                <h3 id={`day-${date}`} className="border-y border-cap-border bg-cap-background px-4 py-1.5 text-xs font-semibold text-cap-text">
                  {date === today && 'Aujourd’hui · '}
                  <time dateTime={date}>{formatDate(date)}</time>
                </h3>
                <ul className="divide-y divide-cap-border px-4">{items.map(renderEvent)}</ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
