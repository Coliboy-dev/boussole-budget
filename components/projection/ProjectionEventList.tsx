import { formatCurrency, formatDate } from '@/lib/budget-calculations';
import type { ProjectionEvent } from '@/lib/projection';

const eventLabels = {
  income: 'Revenu',
  expense: 'Charge',
  child: 'Remboursement enfant',
  debt: 'Dette',
};

interface Props {
  events: ProjectionEvent[];
  today: string;
  horizon: number;
  onPay: (event: ProjectionEvent) => void;
  storageBlocked: boolean;
}

export default function ProjectionEventList({ events, today, horizon, onPay, storageBlocked }: Props) {
  const late = events.filter((event) => event.isLate);
  const upcoming = new Map<string, ProjectionEvent[]>();
  for (const event of events) {
    if (event.isLate) continue;
    const day = upcoming.get(event.dueDate) ?? [];
    day.push(event);
    upcoming.set(event.dueDate, day);
  }

  function renderEvent(event: ProjectionEvent) {
    const payable = event.amount < 0 && (event.type === 'expense' || event.type === 'debt');

    return (
      <li key={event.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <p className="wrap-break-word text-sm font-semibold text-gray-900">{event.label}</p>
          <p className="text-xs text-gray-600">
            {eventLabels[event.type]}
            {event.isEstimated && ' · Montant incertain'}
            {event.isLate && (
              event.dueDate === today
                ? ' · Date non renseignée'
                : <> · <time dateTime={event.dueDate}>{formatDate(event.dueDate)}</time></>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3">
          <span className={`shrink-0 text-sm font-semibold tabular-nums ${event.amount > 0 ? 'text-teal-800' : 'text-gray-900'}`}>
            {event.amount > 0 ? '+' : ''}{formatCurrency(event.amount)}
          </span>
          {payable && (
            <button
              type="button"
              id={`pay-${event.id}`}
              aria-label={`Payé — ${event.label}`}
              onClick={() => onPay(event)}
              disabled={storageBlocked}
              className="min-h-11 min-w-14 rounded-lg bg-teal-700 px-2 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50"
            >
              Payé
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <section id="en-retard" tabIndex={-1} aria-labelledby="late-heading" className="scroll-mt-4 rounded-2xl border border-amber-200 bg-amber-50">
        <h2 id="late-heading" className="px-3 py-2.5 text-sm font-semibold text-amber-950 sm:px-4">En retard</h2>
        {late.length > 0 ? (
          <ul className="divide-y divide-amber-100 rounded-b-2xl border-t border-amber-200 bg-white">
            {late.map(renderEvent)}
          </ul>
        ) : (
          <p className="px-3 pb-3 text-sm text-amber-950 sm:px-4">Aucune échéance en retard.</p>
        )}
      </section>

      <section aria-labelledby="upcoming-heading" className="space-y-3">
        <h2 id="upcoming-heading" className="text-sm font-semibold text-gray-900">À venir · {horizon} jours</h2>
        {upcoming.size === 0 && <p className="text-sm text-gray-600">Aucune échéance à venir sur cette période.</p>}
        {[...upcoming].map(([date, day]) => (
          <div key={date} className="rounded-2xl border border-gray-200 bg-white">
            <h3 className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 sm:px-4">
              {date === today && 'Aujourd’hui · '}
              <time dateTime={date}>{formatDate(date)}</time>
            </h3>
            <ul className="divide-y divide-gray-100">{day.map(renderEvent)}</ul>
          </div>
        ))}
      </section>
    </div>
  );
}
