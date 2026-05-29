import Card from '@/components/ui/Card';
import { formatCurrency } from '@/lib/budget-calculations';
import type { BudgetSummary } from '@/lib/types';

interface BudgetChartProps {
  summary: BudgetSummary;
}

export default function BudgetChart({ summary }: BudgetChartProps) {
  const total = summary.totalMonthlyIncome;
  const expensesPercent = total > 0 ? (summary.totalMonthlyExpenses / total) * 100 : 0;
  const debtsPercent = total > 0 ? (summary.totalMonthlyDebts / total) * 100 : 0;
  const childPercent = total > 0 ? (summary.totalMonthlyChildExpenses / total) * 100 : 0;
  const availablePercent = Math.max(
    0,
    100 - expensesPercent - debtsPercent - childPercent
  );

  return (
    <Card>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Répartition mensuelle</h3>

      {/* Stacked bar */}
      <div className="flex h-5 rounded-full overflow-hidden mb-3 gap-0.5">
        <div
          className="bg-teal-500 h-full transition-all"
          style={{ width: `${expensesPercent}%` }}
          title={`Charges: ${formatCurrency(summary.totalMonthlyExpenses)}`}
        />
        <div
          className="bg-amber-500 h-full transition-all"
          style={{ width: `${debtsPercent}%` }}
          title={`Dettes: ${formatCurrency(summary.totalMonthlyDebts)}`}
        />
        <div
          className="bg-indigo-400 h-full transition-all"
          style={{ width: `${childPercent}%` }}
          title={`Enfants: ${formatCurrency(summary.totalMonthlyChildExpenses)}`}
        />
        <div
          className="bg-green-400 h-full transition-all flex-1"
          style={{ width: `${availablePercent}%` }}
          title="Disponible"
        />
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-teal-500 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Charges</p>
            <p className="text-sm font-semibold text-gray-800">{formatCurrency(summary.totalMonthlyExpenses)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-amber-500 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Dettes</p>
            <p className="text-sm font-semibold text-gray-800">{formatCurrency(summary.totalMonthlyDebts)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-indigo-400 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Enfants</p>
            <p className="text-sm font-semibold text-gray-800">{formatCurrency(summary.totalMonthlyChildExpenses)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-green-400 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Revenus totaux</p>
            <p className="text-sm font-semibold text-gray-800">{formatCurrency(summary.totalMonthlyIncome)}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
