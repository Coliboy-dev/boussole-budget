'use client';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { calculateTotalMonthlyExpenses, formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import type { Expense, ExpenseCategory } from '@/lib/types';
import { useApp } from '@/lib/context/AppContext';
import { addDays } from '@/lib/local-date';
import { expenseOccurrences, isOpenOccurrence } from '@/lib/occurrences';
import OccurrencePayment from './OccurrencePayment';
import { Icon, expenseCategoryIcons } from '@/components/ui/icons';

interface ExpenseListProps {
  expenses: Expense[];
  onEdit?: (expense: Expense) => void;
  onDelete?: (id: string) => void;
}

const categoryConfig: Record<ExpenseCategory, { label: string }> = {
  rent: { label: 'Logement' },
  energy: { label: 'Énergie' },
  phone: { label: 'Téléphone' },
  insurance: { label: 'Assurance' },
  groceries: { label: 'Courses' },
  transport: { label: 'Transport' },
  health: { label: 'Santé' },
  school: { label: 'Scolarité' },
  subscriptions: { label: 'Abonnements' },
  other: { label: 'Autre' },
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
        <Icon icon={expenseCategoryIcons.other} className="mx-auto mb-2 size-9 text-teal-700" />
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
                <Icon icon={expenseCategoryIcons[category as ExpenseCategory] ?? expenseCategoryIcons.other} className="size-4 text-teal-700" />
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
                  <Card key={expense.id} className="flex items-start gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-teal-50 text-teal-800"
                    >
                      <Icon icon={expenseCategoryIcons[category as ExpenseCategory] ?? expenseCategoryIcons.other} />
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
