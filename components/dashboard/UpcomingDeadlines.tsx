import Card from '@/components/ui/Card';
import { formatShortDate, formatCurrency } from '@/lib/budget-calculations';
import type { Reminder } from '@/lib/types';

interface UpcomingDeadlinesProps {
  reminders: Reminder[];
}

const typeConfig: Record<string, { icon: string; color: string }> = {
  expense: { icon: '📋', color: 'bg-teal-100 text-teal-700' },
  debt: { icon: '💳', color: 'bg-amber-100 text-amber-700' },
  mediation: { icon: '🤝', color: 'bg-indigo-100 text-indigo-700' },
  child: { icon: '👨‍👧‍👦', color: 'bg-purple-100 text-purple-700' },
  income: { icon: '💰', color: 'bg-green-100 text-green-700' },
};

export default function UpcomingDeadlines({ reminders }: UpcomingDeadlinesProps) {
  if (reminders.length === 0) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Échéances à venir</h3>
        <p className="text-sm text-gray-400 text-center py-4">Aucune échéance dans les 30 prochains jours.</p>
      </Card>
    );
  }

  return (
    <Card padding="none">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-gray-700">Échéances à venir</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {reminders.slice(0, 6).map((reminder) => {
          const config = typeConfig[reminder.type] || typeConfig.expense;
          return (
            <div
              key={reminder.id}
              className={`flex items-center gap-3 px-4 py-3 ${reminder.isUrgent ? 'bg-red-50/50' : ''}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${config.color}`}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{reminder.label}</p>
                <p className={`text-xs ${reminder.isUrgent ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                  {reminder.isUrgent && '⚡ '}
                  {formatShortDate(reminder.dueDate)}
                </p>
              </div>
              {reminder.amount !== undefined && (
                <span className="text-sm font-semibold text-gray-700 flex-shrink-0">
                  {formatCurrency(reminder.amount)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
