import DebtList from '@/components/debts/DebtList';
import Card from '@/components/ui/Card';
import AlertBanner from '@/components/ui/AlertBanner';
import { calculateTotalMonthlyDebts, formatCurrency } from '@/lib/budget-calculations';
import { mockDebts } from '@/lib/mock-data';

export default function DettesPage() {
  const totalRemaining = mockDebts.reduce((s, d) => s + d.remainingAmount, 0);
  const totalMonthly = calculateTotalMonthlyDebts(mockDebts);
  const lateDebts = mockDebts.filter((d) => d.status === 'late');
  const mediationDebts = mockDebts.filter((d) => d.status === 'in_mediation');
  const totalInitial = mockDebts.reduce((s, d) => s + d.initialAmount, 0);
  const repaidPercent = totalInitial > 0
    ? Math.round(((totalInitial - totalRemaining) / totalInitial) * 100)
    : 0;

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">💳 Mes dettes</h1>
        <p className="text-sm text-gray-500 mt-0.5">Suivi de tes remboursements</p>
      </div>

      {lateDebts.length > 0 && (
        <AlertBanner variant="danger" title="Dettes en retard">
          {lateDebts.length === 1
            ? 'Une dette est en retard de paiement.'
            : `${lateDebts.length} dettes sont en retard.`}{' '}
          Contacte ton médiateur avant d&apos;agir seul(e).
        </AlertBanner>
      )}

      {/* Summary */}
      <Card className="bg-amber-50 border-amber-200">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-gray-500 mb-1">Total restant</p>
            <p className="text-lg font-bold text-amber-700">{formatCurrency(totalRemaining)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Mensualités</p>
            <p className="text-lg font-bold text-amber-700">{formatCurrency(totalMonthly)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Remboursé</p>
            <p className="text-lg font-bold text-green-600">{repaidPercent}%</p>
          </div>
        </div>
        <div className="mt-3 flex gap-3 text-xs text-center">
          <div className="flex-1 bg-indigo-100 rounded-lg py-1.5">
            <span className="font-semibold text-indigo-700">{mediationDebts.length}</span>
            <p className="text-indigo-600">en médiation</p>
          </div>
          <div className="flex-1 bg-red-100 rounded-lg py-1.5">
            <span className="font-semibold text-red-700">{lateDebts.length}</span>
            <p className="text-red-600">en retard</p>
          </div>
          <div className="flex-1 bg-gray-100 rounded-lg py-1.5">
            <span className="font-semibold text-gray-700">{mockDebts.length}</span>
            <p className="text-gray-500">total</p>
          </div>
        </div>
      </Card>

      <DebtList debts={mockDebts} />
    </div>
  );
}
