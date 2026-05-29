import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ProgressBar from '@/components/ui/ProgressBar';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import type { Goal, GoalStatus } from '@/lib/types';

interface GoalCardProps {
  goal: Goal;
}

const statusConfig: Record<GoalStatus, {
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';
  progressColor: 'primary' | 'success' | 'warning' | 'danger' | 'accent';
}> = {
  realistic: { label: '✅ Réalisable', variant: 'success', progressColor: 'success' },
  fragile: { label: '⚠️ Fragile', variant: 'warning', progressColor: 'warning' },
  to_postpone: { label: '⏸️ À reporter', variant: 'neutral', progressColor: 'primary' },
};

export default function GoalCard({ goal }: GoalCardProps) {
  const status = statusConfig[goal.status];
  const percent = goal.targetAmount > 0
    ? Math.min(100, (goal.savedAmount / goal.targetAmount) * 100)
    : 0;

  const remaining = goal.targetAmount - goal.savedAmount;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800">{goal.label}</p>
          {goal.notes && (
            <p className="text-xs text-gray-400 mt-0.5">{goal.notes}</p>
          )}
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {/* Amounts */}
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-xs text-gray-400">Épargné</p>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(goal.savedAmount)}</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-500">{Math.round(percent)}%</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Objectif</p>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(goal.targetAmount)}</p>
        </div>
      </div>

      <ProgressBar value={percent} color={status.progressColor} size="md" />

      {/* Info footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 flex-wrap gap-2">
        <span>Il reste {formatCurrency(remaining)}</span>
        {goal.monthlyContribution && (
          <span className="font-medium text-teal-600">
            + {formatCurrency(goal.monthlyContribution)}/mois
          </span>
        )}
      </div>

      {goal.targetDate && (
        <p className="text-xs text-gray-400 mt-1">
          🎯 Objectif : {formatShortDate(goal.targetDate)}
        </p>
      )}
    </Card>
  );
}
