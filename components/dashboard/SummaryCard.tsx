import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { formatCurrency, formatDate, formatShortDate } from '@/lib/budget-calculations';
import { householdCopy } from '@/lib/household-copy';
import type { BudgetSummary } from '@/lib/types';
import { RiskChip } from '@/components/projection/ProjectionTimeline';
import { Icon } from '@/components/ui/icons';

interface SummaryCardProps {
  summary: BudgetSummary;
  hasUndatedPayments: boolean;
  hasRecordedBalance?: boolean;
  inHousehold?: boolean;
  /** Réglages affichés sous le chiffre (solde, réserve). */
  children?: ReactNode;
}

/**
 * Carte du vrai disponible (Élan V3) : fond teal profond, chiffre en blanc.
 * Le statut est toujours écrit ; un budget vide n'en affiche aucun.
 */
export default function SummaryCard({
  summary, hasUndatedPayments, hasRecordedBalance = false, inHousehold = false, children,
}: SummaryCardProps) {
  const empty = summary.emptyBudget && !hasRecordedBalance;
  const forecast = summary.availableForecast;
  const end = forecast.dailyBalances.at(-1);
  const causes = forecast.causes.slice(0, 2).join(', ');
  // L'épargne « gardée sur le compte courant » fait partie du solde : elle ne peut pas le dépasser.
  const savedOnAccount = forecast.goalSavings - forecast.goalThisMonth;
  const savingsAboveBalance = savedOnAccount > 0 && savedOnAccount > summary.currentBalance;

  return (
    <section className="overflow-hidden rounded-[22px] border border-cap-border bg-cap-surface shadow-[0_1px_2px_rgba(23,44,55,0.04)]">
      <div className="relative space-y-3 overflow-hidden bg-cap-primary-strong p-5 text-white">
        <span aria-hidden="true" className="pointer-events-none absolute -right-12 -bottom-16 size-48 rounded-full bg-white/8" />
        <span aria-hidden="true" className="pointer-events-none absolute -right-2 -top-10 size-28 rounded-full bg-white/6" />
        <div className="relative">
          <h2 className="text-sm font-semibold text-white/90">{inHousehold ? householdCopy.confirmedAvailable : 'Vrai disponible'}</h2>
          <p className="mt-1 font-display text-4xl font-extrabold leading-tight tracking-tight tabular-nums wrap-anywhere sm:text-5xl">
            {formatCurrency(summary.trueAvailable)}
          </p>
          {end && !empty && (
            <p className="mt-1 text-sm font-medium text-white/90">
              Jusqu’au <time dateTime={end.date}>{formatDate(end.date)}</time>
            </p>
          )}
          {(!summary.emptyBudget || hasUndatedPayments) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {!summary.emptyBudget && <RiskChip risk={summary.riskLevel} />}
              {hasUndatedPayments && (
                <span className="inline-flex items-center gap-1 rounded-full bg-cap-warning-soft px-2 py-0.5 text-xs font-semibold text-cap-warning-text">
                  <Icon icon={TriangleAlert} className="size-3.5" />
                  Projection partielle
                </span>
              )}
            </div>
          )}
        </div>
        {summary.emptyBudget ? (
          <p className="relative text-sm text-white/90">
            {hasRecordedBalance ? 'Aucune échéance saisie pour l’instant.' : 'Saisis ton solde et tes échéances pour obtenir la projection.'}
          </p>
        ) : (
          <p className="relative text-sm leading-relaxed text-white/90">
            Point bas prévu le <time dateTime={forecast.date}>{formatShortDate(forecast.date)}</time> à{' '}
            {formatCurrency(forecast.balance)}{causes && ` après ${causes}`}, moins {formatCurrency(summary.safetyReserve)} de réserve
            {forecast.annualProvision > 0 && ` et ${formatCurrency(forecast.annualProvision)} de provisions annuelles`}
            {forecast.goalSavings > 0 && ` et ${formatCurrency(forecast.goalSavings)} mis de côté pour tes objectifs`}
            {forecast.goalThisMonth > 0
              && ` (${formatCurrency(forecast.goalSavings - forecast.goalThisMonth)} déjà épargnés + ${formatCurrency(forecast.goalThisMonth)} à mettre de côté ce mois-ci)`}.
          </p>
        )}
        {savingsAboveBalance && (
          <p role="note" className="relative flex gap-2 rounded-xl bg-white/12 px-3 py-2 text-sm text-white">
            <Icon icon={TriangleAlert} className="mt-0.5 size-4 shrink-0" />
            <span>
              Ton solde ({formatCurrency(summary.currentBalance)}) est plus bas que l’épargne que tu dis garder sur ton compte courant
              ({formatCurrency(savedOnAccount)}). Vérifie ton solde, ou indique dans Objectifs que cette épargne est sur un compte à part.
            </span>
          </p>
        )}
        {inHousehold && (!summary.emptyBudget || hasRecordedBalance) && (
          <div className="relative rounded-xl bg-white/12 px-3 py-2 text-sm">
            <p className="text-white/90">{householdCopy.expectedAvailable}</p>
            <p className="font-bold tabular-nums">{formatCurrency(forecast.optimisticAvailable)}</p>
          </div>
        )}
        {!inHousehold && forecast.optimisticAvailable > summary.trueAvailable && (
          <details className="relative text-sm text-white/90">
            <summary className="cursor-pointer font-medium focus-visible:outline-white">Si les revenus incertains arrivent</summary>
            <p className="mt-2">Vrai disponible estimé à <strong className="text-white">{formatCurrency(forecast.optimisticAvailable)}</strong>.</p>
          </details>
        )}
      </div>
      {children && <div className="bg-cap-surface">{children}</div>}
    </section>
  );
}
