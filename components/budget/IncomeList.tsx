import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatCurrency, formatShortDate, toMonthlyAmount } from '@/lib/budget-calculations';
import type { Income } from '@/lib/types';

interface IncomeListProps {
  incomes: Income[];
}

const typeLabels: Record<string, string> = {
  mutual_insurance: 'Mutuelle',
  allocation: 'Allocation',
  alimony: 'Pension alim.',
  salary: 'Salaire',
  freelance: 'Freelance',
  other: 'Autre',
};

const freqLabels: Record<string, string> = {
  monthly: '/mois',
  weekly: '/semaine',
  bi_monthly: '/2 mois',
  quarterly: '/trimestre',
  annual: '/an',
  one_time: 'unique',
};

export default function IncomeList({ incomes }: IncomeListProps) {
  return (
    <div className="space-y-3">
      {incomes.map((income) => {
        const monthlyEquiv = toMonthlyAmount(income.amount, income.frequency);
        return (
          <Card key={income.id} className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-xl flex-shrink-0">
              💰
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-800">{income.label}</p>
                <p className="text-base font-bold text-green-600 flex-shrink-0">
                  {formatCurrency(income.amount)}
                  <span className="text-xs font-normal text-gray-400 ml-1">
                    {freqLabels[income.frequency] || ''}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="neutral">{typeLabels[income.type] || income.type}</Badge>
                {income.isConfirmed ? (
                  <Badge variant="success">Confirmé</Badge>
                ) : (
                  <Badge variant="warning">Incertain</Badge>
                )}
                {income.frequency !== 'monthly' && (
                  <span className="text-xs text-gray-400">
                    ≈ {formatCurrency(monthlyEquiv)}/mois
                  </span>
                )}
              </div>
              {income.expectedDate && (
                <p className="text-xs text-gray-400 mt-1">
                  Prochain versement : {formatShortDate(income.expectedDate)}
                </p>
              )}
              {income.notes && (
                <p className="text-xs text-gray-400 mt-1 italic">{income.notes}</p>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
