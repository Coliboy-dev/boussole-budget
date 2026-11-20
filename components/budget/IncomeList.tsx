'use client';

import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatCurrency, formatShortDate, toMonthlyAmount } from '@/lib/budget-calculations';
import type { Income } from '@/lib/types';
import { useApp } from '@/lib/context/AppContext';
import { addDays } from '@/lib/local-date';
import { incomeOccurrences, isOpenOccurrence } from '@/lib/occurrences';
import OccurrencePayment from './OccurrencePayment';

interface IncomeListProps {
  incomes: Income[];
  onEdit?: (income: Income) => void;
  onDelete?: (id: string) => void;
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

export default function IncomeList({ incomes, onEdit, onDelete }: IncomeListProps) {
  const { today } = useApp();
  const nextYear = addDays(today, 366);
  if (incomes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600">
        <p className="text-4xl mb-2">💰</p>
        <p className="text-sm">Aucun revenu enregistré.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {incomes.map((income) => {
        const monthlyEquiv = toMonthlyAmount(income.amount, income.frequency);
        const end = income.expectedDate && income.expectedDate > nextYear ? income.expectedDate : nextYear;
        const next = incomeOccurrences(income, today, end).find(isOpenOccurrence);
        return (
          <Card key={income.id} className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-xl flex-shrink-0">
              💰
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-800">{income.label}</p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <p className="text-base font-bold text-green-800">
                    {formatCurrency(income.amount)}
                    <span className="text-xs font-normal text-gray-600 ml-1">
                      {freqLabels[income.frequency] || ''}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="neutral">{typeLabels[income.type] || income.type}</Badge>
                {income.isConfirmed ? (
                  <Badge variant="success">Confirmé</Badge>
                ) : (
                  <Badge variant="warning">Incertain</Badge>
                )}
                {income.frequency !== 'monthly' && (
                  <span className="text-xs text-gray-600">
                    ≈ {formatCurrency(monthlyEquiv)}/mois
                  </span>
                )}
              </div>
              {next && (
                <p className="text-xs text-gray-600 mt-1">
                  Prochain versement : {formatShortDate(next.dueDate)}
                </p>
              )}
              {!income.expectedDate && <p className="text-xs text-amber-800 mt-1">Date à renseigner</p>}
              {next && <OccurrencePayment key={next.dueDate} occurrence={next} />}
              {income.notes && (
                <p className="text-xs text-gray-600 mt-1 italic">{income.notes}</p>
              )}
              {(onEdit || onDelete) && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-gray-50">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(income)}
                      className="text-xs text-teal-800 font-semibold hover:underline"
                    >
                      Modifier
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => {
                        if (confirm('Supprimer ce revenu ?')) onDelete(income.id);
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
  );
}
