'use client';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ProgressBar from '@/components/ui/ProgressBar';
import { formatCurrency, formatShortDate, type GoalFeasibility } from '@/lib/budget-calculations';
import { goalContributionCents, remainingGoalCents } from '@/lib/goals';
import { fromCents, toCents } from '@/lib/money';
import type { Goal, GoalStatus } from '@/lib/types';

interface GoalCardProps {
  goal: Goal;
  feasibility: GoalFeasibility;
  onEdit?: (goal: Goal) => void;
  onDelete?: (id: string) => void;
  /** « J'ai mis de côté » : la mise de côté du mois est faite. */
  onContribute?: (goal: Goal) => void;
  /** Le virement vers un compte à part est déduit du solde (hors foyer). */
  transferDeducted?: boolean;
  currentMonth?: string;
}

const statusConfig: Record<
  GoalStatus,
  {
    label: string;
    variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';
    progressColor: 'primary' | 'success' | 'warning' | 'danger' | 'accent';
  }
> = {
  realistic: { label: 'Réaliste', variant: 'success', progressColor: 'success' },
  fragile: { label: 'Fragile', variant: 'warning', progressColor: 'warning' },
  to_postpone: { label: 'À reporter', variant: 'neutral', progressColor: 'primary' },
};

export default function GoalCard({ goal, feasibility, onEdit, onDelete, onContribute, currentMonth, transferDeducted = true }: GoalCardProps) {
  const status = statusConfig[feasibility.status];
  const targetCents = toCents(goal.targetAmount);
  const percent = targetCents > 0 ? Math.min(100, (toCents(goal.savedAmount) / targetCents) * 100) : 0;
  const remaining = fromCents(remainingGoalCents(goal));
  const contribution = fromCents(goalContributionCents(goal));
  const contributedThisMonth = goal.lastContributionMonth !== undefined && goal.lastContributionMonth === currentMonth;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800">{goal.label}</p>
          {goal.notes && <p className="text-xs text-gray-600 mt-0.5">{goal.notes}</p>}
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {feasibility.reason && <p className="mb-3 text-sm leading-relaxed text-gray-700">{feasibility.reason}</p>}

      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-xs text-gray-600">Épargné</p>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(goal.savedAmount)}</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-600">{Math.round(percent)}%</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-600">Objectif</p>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(goal.targetAmount)}</p>
        </div>
      </div>

      <ProgressBar value={percent} color={status.progressColor} size="md" />

      <div className="mt-3 flex items-center justify-between text-xs text-gray-600 flex-wrap gap-2">
        <span>Il reste {formatCurrency(remaining)}</span>
        {contribution > 0 && (
          <span className="font-medium text-teal-800">
            + {formatCurrency(contribution)}/mois
          </span>
        )}
      </div>

      {goal.targetDate && (
        <p className="text-xs text-gray-600 mt-1">Objectif : {formatShortDate(goal.targetDate)}</p>
      )}

      <p className="mt-2 text-xs text-gray-600">
        {goal.onCurrentAccount
          ? 'Gardée sur ton compte courant : les montants épargnés et la mise de côté du mois sont réservés, hors de ton vrai disponible.'
          : goal.onCurrentAccount === false
            ? 'Sur un compte à part : chaque mise de côté est un virement prévu dans tes échéances.'
            : 'Considérée sur un compte à part : modifie l’objectif si tu la gardes sur ton compte courant.'}
      </p>

      {onContribute && contribution > 0 && (
        contributedThisMonth ? (
          <p role="status" className="mt-2 text-sm font-semibold text-teal-800">
            Mis de côté ce mois-ci.{!goal.onCurrentAccount && (transferDeducted
              ? ' Ton solde tient compte du virement.'
              : ' Pense à mettre ton solde bancaire à jour après le virement.')}
          </p>
        ) : (
          <button type="button" onClick={() => onContribute(goal)}
            className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800">
            J’ai mis de côté {formatCurrency(contribution)}
          </button>
        )
      )}

      {(onEdit || onDelete) && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-50">
          {onEdit && (
            <button
              onClick={() => onEdit(goal)}
              className="text-xs text-teal-800 font-semibold hover:underline"
            >
              Modifier
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => {
                if (confirm('Supprimer cet objectif ?')) onDelete(goal.id);
              }}
              className="text-xs text-red-800 font-semibold hover:underline"
            >
              Supprimer
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
