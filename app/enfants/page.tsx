import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import { mockChildExpenses } from '@/lib/mock-data';
import type { ChildExpenseStatus, ChildExpenseCategory } from '@/lib/types';

const statusConfig: Record<ChildExpenseStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' }> = {
  paid: { label: 'Payé', variant: 'neutral' },
  pending: { label: 'En attente remboursement', variant: 'warning' },
  reimbursed: { label: 'Remboursé', variant: 'success' },
  receipt_sent: { label: 'Justificatif envoyé', variant: 'info' },
};

const categoryConfig: Record<ChildExpenseCategory, { label: string; icon: string }> = {
  school: { label: 'Scolarité', icon: '📚' },
  clothing: { label: 'Vêtements', icon: '👕' },
  activities: { label: 'Activités', icon: '⚽' },
  health: { label: 'Santé', icon: '💊' },
  transport: { label: 'Transport', icon: '🚌' },
  other: { label: 'Autre', icon: '📦' },
};

export default function EnfantsPage() {
  const total = mockChildExpenses.reduce((s, e) => s + e.paidByUser, 0);
  const pendingReimbursement = mockChildExpenses
    .filter((e) => e.status === 'pending' || e.status === 'receipt_sent')
    .reduce((s, e) => s + e.shareAmount, 0);

  // Group by child
  const byChild: Record<string, typeof mockChildExpenses> = {};
  mockChildExpenses.forEach((expense) => {
    const name = expense.childName || 'Non précisé';
    if (!byChild[name]) byChild[name] = [];
    byChild[name].push(expense);
  });

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">👨‍👧‍👦 Frais enfants</h1>
        <p className="text-sm text-gray-500 mt-0.5">Dépenses pour tes enfants</p>
      </div>

      {/* Summary */}
      <Card className="bg-purple-50 border-purple-200">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Total avancé</p>
            <p className="text-xl font-bold text-purple-700">{formatCurrency(total)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">À rembourser</p>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(pendingReimbursement)}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3 pt-2 border-t border-purple-100">
          💡 N&apos;oublie pas d&apos;envoyer les justificatifs pour te faire rembourser.
        </p>
      </Card>

      {/* Expenses by child */}
      {Object.entries(byChild).map(([childName, expenses]) => {
        const childTotal = expenses.reduce((s, e) => s + e.paidByUser, 0);
        return (
          <div key={childName}>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-sm font-semibold text-gray-700">
                👤 {childName}
              </h2>
              <span className="text-sm font-bold text-gray-600">{formatCurrency(childTotal)}</span>
            </div>
            <div className="space-y-2">
              {expenses.map((expense) => {
                const catConfig = categoryConfig[expense.category] || categoryConfig.other;
                const status = statusConfig[expense.status];
                return (
                  <Card key={expense.id}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-xl flex-shrink-0">
                        {catConfig.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800">{expense.label}</p>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-gray-800">
                              {formatCurrency(expense.paidByUser)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="neutral">{catConfig.label}</Badge>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-gray-400">
                          <span>{formatShortDate(expense.date)}</span>
                          {expense.shareAmount > 0 && (
                            <span className="ml-2">
                              Part à rembourser : {formatCurrency(expense.shareAmount)}
                            </span>
                          )}
                        </div>
                        {expense.receiptSent && (
                          <p className="text-xs text-green-600 mt-1">✅ Justificatif envoyé</p>
                        )}
                        {!expense.receiptSent && expense.status === 'pending' && (
                          <p className="text-xs text-amber-500 mt-1">
                            📎 Justificatif non encore envoyé
                          </p>
                        )}
                        {expense.notes && (
                          <p className="text-xs text-gray-400 mt-1 italic">{expense.notes}</p>
                        )}
                      </div>
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
