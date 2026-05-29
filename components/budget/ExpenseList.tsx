import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import type { Expense, ExpenseCategory } from '@/lib/types';

interface ExpenseListProps {
  expenses: Expense[];
}

const categoryConfig: Record<ExpenseCategory, { label: string; icon: string; color: string }> = {
  rent: { label: 'Logement', icon: '🏠', color: 'bg-blue-100' },
  energy: { label: 'Énergie', icon: '⚡', color: 'bg-yellow-100' },
  phone: { label: 'Téléphone', icon: '📱', color: 'bg-purple-100' },
  insurance: { label: 'Assurance', icon: '🛡️', color: 'bg-teal-100' },
  groceries: { label: 'Courses', icon: '🛒', color: 'bg-green-100' },
  transport: { label: 'Transport', icon: '🚌', color: 'bg-orange-100' },
  health: { label: 'Santé', icon: '💊', color: 'bg-pink-100' },
  school: { label: 'Scolarité', icon: '📚', color: 'bg-indigo-100' },
  subscriptions: { label: 'Abonnements', icon: '📺', color: 'bg-gray-100' },
  other: { label: 'Autre', icon: '💸', color: 'bg-gray-100' },
};

// Group by category
function groupByCategory(expenses: Expense[]) {
  const groups: Record<string, Expense[]> = {};
  expenses.forEach((expense) => {
    const cat = expense.category;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(expense);
  });
  return groups;
}

export default function ExpenseList({ expenses }: ExpenseListProps) {
  const groups = groupByCategory(expenses);

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([category, items]) => {
        const config = categoryConfig[category as ExpenseCategory] || categoryConfig.other;
        const groupTotal = items.reduce((s, e) => s + e.amount, 0);

        return (
          <div key={category}>
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <span className="text-base">{config.icon}</span>
                <span className="text-sm font-semibold text-gray-600">{config.label}</span>
              </div>
              <span className="text-sm font-bold text-gray-700">{formatCurrency(groupTotal)}</span>
            </div>
            <div className="space-y-2">
              {items.map((expense) => (
                <Card key={expense.id} className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${config.color}`}>
                    {config.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 truncate">{expense.label}</p>
                      <p className="text-sm font-bold text-gray-800 flex-shrink-0">
                        {formatCurrency(expense.amount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {expense.dueDate && (
                        <span className="text-xs text-gray-400">
                          Échéance: {formatShortDate(expense.dueDate)}
                        </span>
                      )}
                      {expense.isPaid ? (
                        <Badge variant="success">Payé</Badge>
                      ) : (
                        <Badge variant="neutral">À payer</Badge>
                      )}
                      {expense.isRecurring && (
                        <Badge variant="neutral">Récurrent</Badge>
                      )}
                    </div>
                    {expense.notes && (
                      <p className="text-xs text-gray-400 mt-0.5 italic">{expense.notes}</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
