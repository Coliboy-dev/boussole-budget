'use client';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ProgressBar from '@/components/ui/ProgressBar';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import type { Debt, DebtStatus } from '@/lib/types';
import { useApp } from '@/lib/context/AppContext';
import { addDays } from '@/lib/local-date';
import { debtOccurrences, isOpenOccurrence } from '@/lib/occurrences';
import OccurrencePayment from '@/components/budget/OccurrencePayment';

interface DebtCardProps {
  debt: Debt;
  onEdit?: (debt: Debt) => void;
  onDelete?: (id: string) => void;
}

const statusConfig: Record<
  DebtStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' }
> = {
  to_pay: { label: 'À rembourser', variant: 'neutral' },
  late: { label: 'En retard', variant: 'danger' },
  contested: { label: 'Contestée', variant: 'warning' },
  in_mediation: { label: 'En médiation', variant: 'accent' },
  plan_accepted: { label: 'Plan accepté', variant: 'success' },
  suspended: { label: 'Suspendue', variant: 'info' },
  completed: { label: 'Remboursée', variant: 'success' },
};

export default function DebtCard({ debt, onEdit, onDelete }: DebtCardProps) {
  const { today } = useApp();
  const nextYear = addDays(today, 366);
  const end = debt.nextDueDate && debt.nextDueDate > nextYear ? debt.nextDueDate : nextYear;
  const next = debtOccurrences(debt, today, end).find(isOpenOccurrence);
  const status = statusConfig[debt.status];
  const progressPercent =
    debt.initialAmount > 0
      ? ((debt.initialAmount - debt.remainingAmount) / debt.initialAmount) * 100
      : 0;

  const progressColor =
    debt.status === 'completed'
      ? 'success'
      : debt.status === 'late'
        ? 'danger'
        : debt.status === 'in_mediation'
          ? 'accent'
          : 'primary';

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">{debt.creditor}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={status.variant}>{status.label}</Badge>
            {debt.type === 'shared' && <Badge variant="info">Partagée</Badge>}
            {debt.isMediationIncluded && <Badge variant="accent">Médiation</Badge>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-gray-800">{formatCurrency(debt.remainingAmount)}</p>
          <p className="text-xs text-gray-600">restant</p>
        </div>
      </div>

      {debt.initialAmount > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Initial: {formatCurrency(debt.initialAmount)}</span>
            <span>{Math.round(progressPercent)}% remboursé</span>
          </div>
          <ProgressBar value={progressPercent} color={progressColor} size="sm" />
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-600 flex-wrap gap-2">
        {debt.monthlyPayment > 0 ? (
          <span className="font-medium">💳 {formatCurrency(debt.monthlyPayment)}/mois</span>
        ) : (
          <span className="text-gray-600">Aucun paiement mensuel</span>
        )}
        {next && (
          <span>
            {next.status === 'late' ? 'En retard depuis le ' : 'Échéance du '}
            {formatShortDate(next.dueDate)}
          </span>
        )}
        {!debt.nextDueDate && debt.monthlyPayment > 0 && !next && <span>Date à renseigner</span>}
      </div>

      {next && <OccurrencePayment key={next.dueDate} occurrence={next} />}

      {debt.notes && (
        <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-50 italic">
          {debt.notes}
        </p>
      )}

      {(onEdit || onDelete) && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-50">
          {onEdit && (
            <button
              onClick={() => onEdit(debt)}
              className="text-xs text-teal-800 font-semibold hover:underline"
            >
              Modifier
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => {
                if (confirm('Supprimer cette dette ?')) onDelete(debt.id);
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
