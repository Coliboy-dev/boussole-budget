'use client';

import Badge from '@/components/ui/Badge';
import ProgressBar from '@/components/ui/ProgressBar';
import { DetailFact } from '@/components/budget/CompactRows';
import { formatCurrency, formatDate, formatShortDate } from '@/lib/budget-calculations';
import type { Debt, DebtStatus } from '@/lib/types';
import { useApp } from '@/lib/context/AppContext';
import { estimateDebtEndDate, nextDebtOccurrence } from '@/lib/debt-payoff';
import OccurrencePayment from '@/components/budget/OccurrencePayment';
import UnscheduledDebtPayment from './UnscheduledDebtPayment';

export const statusConfig: Record<
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

export function debtProgress(debt: Debt) {
  const percent = debt.initialAmount > 0
    ? ((debt.initialAmount - debt.remainingAmount) / debt.initialAmount) * 100
    : 0;
  const color = debt.status === 'completed'
    ? 'success'
    : debt.status === 'late'
      ? 'danger'
      : debt.status === 'in_mediation'
        ? 'accent'
        : 'primary';
  return { percent, color } as const;
}

export function DebtBadges({ debt }: { debt: Debt }) {
  const status = statusConfig[debt.status];
  return (
    <>
      <Badge variant={status.variant}>{status.label}</Badge>
      {debt.type === 'shared' && <Badge variant="info">Partagée</Badge>}
      {debt.isMediationIncluded && debt.status !== 'in_mediation' && <Badge variant="accent">Médiation</Badge>}
    </>
  );
}

/** Contenu du détail d’une dette : chiffres, échéance, paiement. */
export default function DebtDetail({ debt }: { debt: Debt }) {
  const { today } = useApp();
  const next = nextDebtOccurrence(debt, today);
  const estimatedEnd = estimateDebtEndDate(debt, next, today);
  const progress = debtProgress(debt);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <DebtBadges debt={debt} />
      </div>
      <dl className="space-y-2">
        <DetailFact label="Restant dû">{formatCurrency(debt.remainingAmount)}</DetailFact>
        {debt.initialAmount > 0 && <DetailFact label="Montant initial">{formatCurrency(debt.initialAmount)}</DetailFact>}
        <DetailFact label="Paiement mensuel">
          {debt.monthlyPayment > 0 ? formatCurrency(debt.monthlyPayment) : 'Aucun'}
        </DetailFact>
        {next && debt.nextDueDate && (
          <DetailFact label={next.status === 'late' ? 'En retard depuis le' : 'Prochaine échéance'}>
            <time dateTime={next.dueDate}>{formatShortDate(next.dueDate)}</time>
          </DetailFact>
        )}
        {!debt.nextDueDate && debt.monthlyPayment > 0 && (
          <DetailFact label="Prochaine échéance">Date à renseigner</DetailFact>
        )}
        {estimatedEnd && (
          <DetailFact label="Fin estimée">
            <time dateTime={estimatedEnd}>{formatDate(estimatedEnd)}</time>
          </DetailFact>
        )}
      </dl>
      {debt.initialAmount > 0 && (
        <div>
          <p className="mb-1 text-xs text-slate-600">{Math.round(progress.percent)} % remboursé</p>
          <ProgressBar value={progress.percent} color={progress.color} size="sm" />
        </div>
      )}
      {next ? <OccurrencePayment key={next.dueDate} occurrence={next} /> : <UnscheduledDebtPayment debt={debt} />}
      {debt.notes && <p className="text-sm italic text-slate-600">{debt.notes}</p>}
    </>
  );
}
