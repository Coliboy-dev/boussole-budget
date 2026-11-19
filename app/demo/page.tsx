import Link from 'next/link';
import SummaryCard from '@/components/dashboard/SummaryCard';
import Card from '@/components/ui/Card';
import { calculateBudgetSummary, formatCurrency, formatDate } from '@/lib/budget-calculations';
import { mockChildExpenses, mockCurrentBalance, mockDebts, mockExpenses, mockIncomes, mockUser } from '@/lib/mock-data';

const demoDate = '2026-05-29';

export default function DemoPage() {
  const summary = calculateBudgetSummary(
    mockCurrentBalance,
    mockIncomes,
    mockExpenses,
    mockDebts,
    mockChildExpenses,
    mockUser.safetyReserve,
    [],
    demoDate,
  );

  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Budget de démonstration</h1>
        <p className="mt-1 text-sm text-gray-600">Exemple en lecture seule au {formatDate(demoDate)}.</p>
      </div>
      <Card>
        <p className="text-sm font-medium text-gray-600">Solde bancaire</p>
        <p className="text-2xl font-bold text-gray-800">{formatCurrency(summary.currentBalance)}</p>
      </Card>
      <SummaryCard
        summary={summary}
        hasUndatedPayments={mockExpenses.some(({ dueDate }) => !dueDate)}
      />
      <Link href="/dashboard" className="inline-block text-sm font-medium text-teal-700 underline">
        Retour à mon budget
      </Link>
    </div>
  );
}
