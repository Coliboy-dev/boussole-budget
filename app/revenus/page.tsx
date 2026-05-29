import IncomeList from '@/components/budget/IncomeList';
import Card from '@/components/ui/Card';
import AlertBanner from '@/components/ui/AlertBanner';
import { calculateTotalMonthlyIncome, formatCurrency } from '@/lib/budget-calculations';
import { mockIncomes } from '@/lib/mock-data';

export default function RevenusPage() {
  const totalMonthly = calculateTotalMonthlyIncome(mockIncomes);
  const confirmedTotal = calculateTotalMonthlyIncome(mockIncomes.filter((i) => i.isConfirmed));
  const unconfirmedTotal = totalMonthly - confirmedTotal;

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">💰 Mes revenus</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tous tes revenus mensuels</p>
      </div>

      {/* Summary card */}
      <Card className="bg-green-50 border-green-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-green-600 mb-1">
              Total mensuel
            </p>
            <p className="text-3xl font-bold text-green-700">{formatCurrency(totalMonthly)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">Dont confirmé</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(confirmedTotal)}</p>
          </div>
        </div>
        {unconfirmedTotal > 0 && (
          <p className="text-xs text-amber-600 mt-2 pt-2 border-t border-green-200">
            ⚠️ {formatCurrency(unconfirmedTotal)} de revenus incertains inclus
          </p>
        )}
      </Card>

      {unconfirmedTotal > 0 && (
        <AlertBanner variant="warning" title="Revenus incertains">
          Certains de tes revenus (ex: pension alimentaire) ne sont pas toujours versés à temps.
          Planifie ton budget en priorité sur les revenus confirmés ({formatCurrency(confirmedTotal)}).
        </AlertBanner>
      )}

      <IncomeList incomes={mockIncomes} />
    </div>
  );
}
