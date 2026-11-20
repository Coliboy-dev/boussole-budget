'use client';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { calculateTotalMonthlyExpenses, formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import type { Expense, ExpenseCategory } from '@/lib/types';
import { useApp } from '@/lib/context/AppContext';
import { addDays } from '@/lib/local-date';
import { expenseOccurrences, isOpenOccurrence } from '@/lib/occurrences';
import OccurrencePayment from './OccurrencePayment';

interface ExpenseListProps {
  expenses: Expense[];
  onEdit?: (expense: Expense) => void;
  onDelete?: (id: string) => void;
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

function groupByCategory(expenses: Expense[]) {
  const groups: Record<string, Expense[]> = {};
  expenses.forEach((expense) => {
    if (!groups[expense.category]) groups[expense.category] = [];
    groups[expense.category].push(expense);
  });
  return groups;
}

export default function ExpenseList({ expenses, onEdit, onDelete }: ExpenseListProps) {
  const { today } = useApp();
  const nextYear = addDays(today, 366);
  if (expenses.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600">
        <p className="text-4xl mb-2">📋</p>
        <p className="text-sm">Aucune charge enregistrée.</p>
      </div>
    );
  }

  const groups = groupByCategory(expenses);

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([category, items]) => {
        const config = categoryConfig[category as ExpenseCategory] || categoryConfig.other;
        const groupTotal = calculateTotalMonthlyExpenses(items);

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
              {items.map((expense) => {
                const end = expense.dueDate && expense.dueDate > nextYear ? expense.dueDate : nextYear;
                const next = expenseOccurrences(expense, today, end).find(isOpenOccurrence);
                const anchorStatus = expense.dueDate && expense.occurrenceStatuses?.[expense.dueDate];
                return (
                  <Card key={expense.id} className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${config.color}`}
                    >
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
                        {next && (
                          <>
                            <span className="text-xs text-gray-600">Échéance du {formatShortDate(next.dueDate)}</span>
                            <Badge variant={next.status === 'late' ? 'danger' : 'neutral'}>
                              {next.status === 'late' ? 'En retard' : 'À payer'}
                            </Badge>
                          </>
                        )}
                        {!expense.dueDate && <Badge variant="warning">Date à renseigner</Badge>}
                        {!next && (expense.isPaid || anchorStatus === 'paid') && <Badge variant="success">Payé</Badge>}
                        {!next && anchorStatus === 'cancelled' && <Badge variant="neutral">Annulé</Badge>}
                        {expense.isRecurring && <Badge variant="neutral">Récurrent</Badge>}
                      </div>
                      {next && <OccurrencePayment key={next.dueDate} occurrence={next} />}
                      {expense.notes && (
                        <p className="text-xs text-gray-600 mt-0.5 italic">{expense.notes}</p>
                      )}
                      {(onEdit || onDelete) && (
                        <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-gray-50">
                          {onEdit && (
                            <button
                              onClick={() => onEdit(expense)}
                              className="text-xs text-teal-800 font-semibold hover:underline"
                            >
                              Modifier
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => {
                                if (confirm('Supprimer cette charge ?')) onDelete(expense.id);
                              }}
                              className="text-xs text-red-800 font-semibold hover:underline"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
