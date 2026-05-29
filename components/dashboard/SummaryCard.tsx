import Card from '@/components/ui/Card';
import { formatCurrency } from '@/lib/budget-calculations';
import type { BudgetSummary } from '@/lib/types';

interface SummaryCardProps {
  summary: BudgetSummary;
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

export default function SummaryCard({ summary }: SummaryCardProps) {
  const risk = riskConfig[summary.riskLevel];

  return (
    <div className="space-y-3">
      {/* Balance actuelle */}
      <Card className="bg-teal-600 border-0 text-white">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-teal-100 font-medium">Solde bancaire</span>
          <span className="text-xs text-teal-200">Mis à jour aujourd&apos;hui</span>
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
            <p className="text-xs text-gray-500 mt-1">
              Après charges, dettes et réserve de {formatCurrency(summary.safetyReserve)}
            </p>
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
