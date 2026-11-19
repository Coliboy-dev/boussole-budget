import Card from '@/components/ui/Card';
import { formatCurrency, formatDate } from '@/lib/budget-calculations';
import type { BudgetSummary } from '@/lib/types';

interface SummaryCardProps {
  summary: BudgetSummary;
  balanceDate?: string;
  hasUndatedPayments: boolean;
}

const riskConfig = {
  safe: {
    label: 'Situation stable',
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    dot: 'bg-green-500',
  },
  fragile: {
    label: 'Situation fragile',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  danger: {
    label: 'Situation critique',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    dot: 'bg-red-500',
  },
};

export default function SummaryCard({ summary, balanceDate, hasUndatedPayments }: SummaryCardProps) {
  const risk = riskConfig[summary.riskLevel];
  const forecast = summary.availableForecast;
  const causes = forecast.causes.slice(0, 2).join(', ');

  return (
    <div className="space-y-3">
      <Card className="bg-teal-600 border-0 text-white">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-teal-100 font-medium">Solde bancaire</span>
          {balanceDate && <span className="text-xs text-teal-200">{formatDate(balanceDate)}</span>}
        </div>
        <p className="text-3xl font-bold tracking-tight">{formatCurrency(summary.currentBalance)}</p>
      </Card>
      {/* Vrai disponible */}
      <Card className={`border ${risk.border} ${risk.bg}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-semibold uppercase tracking-wide ${risk.color}`}>
                Vrai disponible
              </span>
              <span className={`w-2 h-2 rounded-full ${risk.dot}`} />
            </div>
            <p className={`text-2xl font-bold ${risk.color}`}>
              {formatCurrency(summary.trueAvailable)}
            </p>
            {summary.emptyBudget ? (
              <p className="text-xs text-gray-500 mt-1">Saisis ton solde et tes échéances pour obtenir la projection.</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                Point bas sur {forecast.horizon} jours le {formatDate(forecast.date)} à{' '}
                {formatCurrency(forecast.balance)}{causes && ` après ${causes}`}.
                Réserve déduite de {formatCurrency(summary.safetyReserve)}.
              </p>
            )}
            {forecast.optimisticAvailable > summary.trueAvailable && (
              <p className="text-xs text-gray-600 mt-1">
                Si les revenus incertains arrivent aux dates prévues{' '}
                <strong>{formatCurrency(forecast.optimisticAvailable)}</strong>.
              </p>
            )}
            {hasUndatedPayments && (
              <p className="text-xs text-amber-800 mt-2">
                Projection partielle. Renseigne les dates des charges et mensualités pour les inclure.
              </p>
            )}
          </div>
          <div className="text-right">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${risk.bg} ${risk.color} border ${risk.border}`}>
              {risk.label}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
