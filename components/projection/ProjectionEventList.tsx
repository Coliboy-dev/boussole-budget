'use client';

import { formatCurrency } from '@/lib/budget-calculations';
import type { ProjectionEvent } from '@/lib/projection';

const typeConfig = {
  income: { icon: '💰', color: 'text-green-600', bg: 'bg-green-50', sign: '+' },
  expense: { icon: '📋', color: 'text-gray-700', bg: 'bg-gray-50', sign: '-' },
  debt: { icon: '💳', color: 'text-amber-700', bg: 'bg-amber-50', sign: '-' },
};

function formatEventDate(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-BE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(dateStr));
}

function daysUntilLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  return `J+${diff}`;
}

interface Props {
  events: ProjectionEvent[];
}

export default function ProjectionEventList({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-3xl mb-2">📅</p>
        <p className="text-sm">Aucun événement financier prévu dans les 30 prochains jours.</p>
        <p className="text-xs mt-1">Ajoute des dates d&apos;échéance à tes charges et dettes.</p>
      </div>
    );
  }

  // Group by date
  const grouped: Record<string, ProjectionEvent[]> = {};
  events.forEach((e) => {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  });

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([date, dayEvents]) => {
        const dayTotal = dayEvents.reduce((s, e) => s + e.amount, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const eventDate = new Date(date);
        eventDate.setHours(0, 0, 0, 0);
        const isToday = eventDate.getTime() === today.getTime();
        const isTomorrow =
          eventDate.getTime() === today.getTime() + 86400000;

        return (
          <div key={date}>
            {/* Date header */}
            <div className="flex items-center justify-between mb-1.5 px-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isToday
                      ? 'bg-teal-100 text-teal-700'
                      : isTomorrow
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {daysUntilLabel(date)}
                </span>
                <span className="text-xs text-gray-500 capitalize">{formatEventDate(date)}</span>
              </div>
              <span
                className={`text-xs font-bold ${dayTotal >= 0 ? 'text-green-600' : 'text-gray-500'}`}
              >
                {dayTotal >= 0 ? '+' : ''}
                {formatCurrency(dayTotal)}
              </span>
            </div>

            {/* Events for this day */}
            <div className="space-y-1.5">
              {dayEvents.map((event) => {
                const cfg = typeConfig[event.type];
                const isIncome = event.amount > 0;
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-3 py-2.5 shadow-sm"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}
                    >
                      <span className="text-sm">{cfg.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-gray-800 truncate">{event.label}</p>
                        {event.isEstimated && (
                          <span className="text-xs text-gray-400 flex-shrink-0">~estimé</span>
                        )}
                      </div>
                    </div>
                    <p
                      className={`text-sm font-bold flex-shrink-0 ${
                        isIncome ? 'text-green-600' : cfg.color
                      }`}
                    >
                      {isIncome ? '+' : ''}
                      {formatCurrency(Math.abs(event.amount))}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
