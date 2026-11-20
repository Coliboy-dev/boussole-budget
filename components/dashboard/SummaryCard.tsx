import { formatCurrency, formatDate, formatShortDate } from '@/lib/budget-calculations';
import type { BudgetSummary } from '@/lib/types';

interface SummaryCardProps {
  summary: BudgetSummary;
  hasUndatedPayments: boolean;
  hasRecordedBalance?: boolean;
}

const riskConfig = {
  safe: { color: 'text-teal-950', border: 'border-teal-200', background: 'bg-teal-50' },
  fragile: { color: 'text-amber-950', border: 'border-amber-200', background: 'bg-amber-50' },
  danger: { color: 'text-red-950', border: 'border-red-200', background: 'bg-red-50' },
};

export default function SummaryCard({ summary, hasUndatedPayments, hasRecordedBalance = false }: SummaryCardProps) {
  const risk = riskConfig[summary.riskLevel];
  const forecast = summary.availableForecast;
  const end = forecast.dailyBalances.at(-1);
  const causes = forecast.causes.slice(0, 2).join(', ');

  return (
    <section className={`space-y-3 rounded-2xl border p-4 shadow-sm ${risk.border} ${risk.background}`}>
      <div className={risk.color}>
        <h2 className="text-sm font-semibold">Vrai disponible</h2>
        <p className="mt-1 text-4xl font-bold leading-tight tracking-tight tabular-nums wrap-anywhere sm:text-5xl">
          {formatCurrency(summary.trueAvailable)}
        </p>
        {end && (!summary.emptyBudget || hasRecordedBalance) && (
          <p className="mt-1 text-sm font-medium">
            Jusqu’au <time dateTime={end.date}>{formatDate(end.date)}</time>
          </p>
        )}
      </div>
      {summary.emptyBudget ? (
        <p className="text-sm text-gray-700">
          {hasRecordedBalance ? 'Aucune échéance saisie pour l’instant.' : 'Saisis ton solde et tes échéances pour obtenir la projection.'}
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-gray-700">
          Point bas prévu le <time dateTime={forecast.date}>{formatShortDate(forecast.date)}</time> à{' '}
          {formatCurrency(forecast.balance)}{causes && ` après ${causes}`}, moins {formatCurrency(summary.safetyReserve)} de réserve.
        </p>
      )}
      {hasUndatedPayments && (
        <p className="text-sm text-amber-900">
          Projection partielle. Renseigne les dates des charges et mensualités pour les inclure.
        </p>
      )}
      {forecast.optimisticAvailable > summary.trueAvailable && (
        <details className="text-sm text-gray-700">
          <summary className="cursor-pointer font-medium">Si les revenus incertains arrivent</summary>
          <p className="mt-2">Vrai disponible estimé à <strong>{formatCurrency(forecast.optimisticAvailable)}</strong>.</p>
        </details>
      )}
    </section>
  );
}
