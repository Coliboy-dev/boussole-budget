import ExpenseList from '@/components/budget/ExpenseList';
import Card from '@/components/ui/Card';
import { calculateTotalMonthlyExpenses, formatCurrency } from '@/lib/budget-calculations';
import { mockExpenses, mockIncomes } from '@/lib/mock-data';
import { calculateTotalMonthlyIncome } from '@/lib/budget-calculations';
import type { ExpenseCategory } from '@/lib/types';

const categoryNames: Record<ExpenseCategory, string> = {
  rent: 'Logement',
  energy: 'Énergie',
  phone: 'Téléphone',
  insurance: 'Assurance',
  groceries: 'Courses',
  transport: 'Transport',
  health: 'Santé',
  school: 'Scolarité',
  subscriptions: 'Abonnements',
  other: 'Autre',
};

export default function ChargesPage() {
  const totalExpenses = calculateTotalMonthlyExpenses(mockExpenses);
  const totalIncome = calculateTotalMonthlyIncome(mockIncomes);
  const ratio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

  // Category totals
  const byCategory: Record<string, number> = {};
  mockExpenses.forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  });

  const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">📋 Mes charges</h1>
        <p className="text-sm text-gray-500 mt-0.5">Toutes tes dépenses mensuelles</p>
      </div>

      {/* Summary card */}
      <Card className="bg-teal-50 border-teal-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 mb-1">
              Total mensuel
            </p>
            <p className="text-3xl font-bold text-teal-700">{formatCurrency(totalExpenses)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">% des revenus</p>
            <p className={`text-lg font-bold ${ratio > 80 ? 'text-red-500' : ratio > 60 ? 'text-amber-500' : 'text-teal-600'}`}>
              {Math.round(ratio)}%
            </p>
          </div>
        </div>
        {/* Simple bar showing ratio */}
        <div className="w-full bg-teal-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full ${ratio > 80 ? 'bg-red-400' : ratio > 60 ? 'bg-amber-400' : 'bg-teal-400'}`}
            style={{ width: `${Math.min(100, ratio)}%` }}
          />
        </div>
        {topCategory && (
          <p className="text-xs text-gray-500 mt-2">
            Poste principal : <strong>{categoryNames[topCategory[0] as ExpenseCategory] || topCategory[0]}</strong>{' '}
            ({formatCurrency(topCategory[1])})
          </p>
        )}
      </Card>

      <ExpenseList expenses={mockExpenses} />
    </div>
  );
}
