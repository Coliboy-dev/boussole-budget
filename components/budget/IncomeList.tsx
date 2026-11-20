'use client';

import { useState } from 'react';
import Badge from '@/components/ui/Badge';
import { formatCurrency, formatShortDate, toMonthlyAmount } from '@/lib/budget-calculations';
import type { Income } from '@/lib/types';
import { useApp } from '@/lib/context/AppContext';
import { addDays } from '@/lib/local-date';
import { incomeOccurrences, isOpenOccurrence } from '@/lib/occurrences';
import OccurrencePayment from './OccurrencePayment';
import { CompactRows, DetailFact, DetailSheet, type CompactRow } from './CompactRows';
import { frequencyLabels } from './ExpenseList';
import { Wallet } from 'lucide-react';
import { Icon } from '@/components/ui/icons';

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

function nextIncome(income: Income, today: string) {
  const nextYear = addDays(today, 366);
  const end = income.expectedDate && income.expectedDate > nextYear ? income.expectedDate : nextYear;
  return incomeOccurrences(income, today, end).find(isOpenOccurrence);
}

function ConfirmationBadge({ income }: { income: Income }) {
  return income.isConfirmed
    ? <Badge variant="success">Confirmé</Badge>
    : <Badge variant="warning">Incertain</Badge>;
}

export default function IncomeList({ incomes, onEdit, onDelete }: IncomeListProps) {
  const { today } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);

  if (incomes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600">
        <Icon icon={Wallet} className="mx-auto mb-2 size-9 text-teal-700" />
        <p className="text-sm">Aucun revenu enregistré.</p>
      </div>
    );
  }

  const rows: CompactRow[] = incomes.map((income) => {
    const next = nextIncome(income, today);
    const type = typeLabels[income.type] || income.type;
    return {
      id: income.id,
      title: income.label,
      icon: Wallet,
      tone: 'green',
      badges: (
        <>
          <ConfirmationBadge income={income} />
          {!income.expectedDate && <Badge variant="warning">Date à renseigner</Badge>}
        </>
      ),
      meta: next ? <>{type} · Versement le {formatShortDate(next.dueDate)}</> : type,
      amount: <span className="text-green-800">+{formatCurrency(income.amount)}</span>,
      amountNote: freqLabels[income.frequency],
    };
  });
  const opened = incomes.find((income) => income.id === openId);
  const openedNext = opened && nextIncome(opened, today);

  return (
    <>
      <CompactRows rows={rows} onOpen={setOpenId} />
      {opened && (
        <DetailSheet
          title={opened.label}
          onClose={() => setOpenId(null)}
          onEdit={onEdit && (() => { setOpenId(null); onEdit(opened); })}
          onDelete={onDelete && (() => { setOpenId(null); onDelete(opened.id); })}
          deleteLabel="Supprimer ce revenu et tous ses versements prévus ?"
        >
          <dl className="space-y-2">
            <DetailFact label="Montant">{formatCurrency(opened.amount)}</DetailFact>
            <DetailFact label="Fréquence">{frequencyLabels[opened.frequency]}</DetailFact>
            {opened.frequency !== 'monthly' && opened.frequency !== 'one_time' && (
              <DetailFact label="Équivalent mensuel">
                ≈ {formatCurrency(toMonthlyAmount(opened.amount, opened.frequency))}
              </DetailFact>
            )}
            <DetailFact label="Type">{typeLabels[opened.type] || opened.type}</DetailFact>
            {openedNext && <DetailFact label="Prochain versement">{formatShortDate(openedNext.dueDate)}</DetailFact>}
          </dl>
          <div className="flex flex-wrap gap-2">
            <ConfirmationBadge income={opened} />
            {!opened.expectedDate && <Badge variant="warning">Date à renseigner</Badge>}
          </div>
          {openedNext && <OccurrencePayment key={openedNext.dueDate} occurrence={openedNext} />}
          {opened.notes && <p className="text-sm italic text-slate-600">{opened.notes}</p>}
        </DetailSheet>
      )}
    </>
  );
}
