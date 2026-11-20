'use client';

import { useState } from 'react';
import Badge from '@/components/ui/Badge';
import { formatCurrency, formatShortDate, toMonthlyAmount } from '@/lib/budget-calculations';
import type { Expense, ExpenseCategory, Frequency } from '@/lib/types';
import { useApp } from '@/lib/context/AppContext';
import { addDays } from '@/lib/local-date';
import { expenseOccurrences, isOpenOccurrence, type Occurrence } from '@/lib/occurrences';
import OccurrencePayment from './OccurrencePayment';
import { CompactRows, DetailFact, DetailSheet, type CompactRow } from './CompactRows';
import { Icon, expenseCategoryIcons } from '@/components/ui/icons';

interface ExpenseListProps {
  expenses: Expense[];
  onEdit?: (expense: Expense) => void;
  onDelete?: (id: string) => void;
}

const categoryLabels: Record<ExpenseCategory, string> = {
  rent: 'Logement',
  energy: 'Énergie',
  phone: 'Téléphone',
  insurance: 'Assurance',
  groceries: 'Courses',
  transport: 'Transport',
  health: 'Santé',
  school: 'Scolarité',
  subscriptions: 'Abonnements',
  other: 'Autre',
};

export const frequencyLabels: Record<Frequency, string> = {
  monthly: 'Mensuel',
  weekly: 'Hebdomadaire',
  bi_monthly: 'Tous les 2 mois',
  quarterly: 'Trimestriel',
  annual: 'Annuel',
  one_time: 'Unique',
};

function expenseState(expense: Expense, today: string) {
  const end = expense.dueDate && expense.dueDate > addDays(today, 366) ? expense.dueDate : addDays(today, 366);
  const next = expenseOccurrences(expense, today, end).find(isOpenOccurrence);
  const anchorStatus = expense.dueDate ? expense.occurrenceStatuses?.[expense.dueDate] : undefined;
  return { next, anchorStatus };
}

function StatusBadge({ expense, next, anchorStatus }: {
  expense: Expense; next?: Occurrence; anchorStatus?: string;
}) {
  if (!expense.dueDate) return <Badge variant="warning">Date à renseigner</Badge>;
  if (next?.status === 'late') return <Badge variant="danger">En retard</Badge>;
  if (!next && (expense.isPaid || anchorStatus === 'paid')) return <Badge variant="success">Payé</Badge>;
  if (!next && anchorStatus === 'cancelled') return <Badge variant="neutral">Annulé</Badge>;
  return null;
}

export default function ExpenseList({ expenses, onEdit, onDelete }: ExpenseListProps) {
  const { today } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);

  if (expenses.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600">
        <Icon icon={expenseCategoryIcons.other} className="mx-auto mb-2 size-9 text-teal-700" />
        <p className="text-sm">Aucune charge enregistrée.</p>
      </div>
    );
  }

  const order = Object.keys(categoryLabels) as ExpenseCategory[];
  const sorted = [...expenses].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  const rows: CompactRow[] = sorted.map((expense) => {
    const { next, anchorStatus } = expenseState(expense, today);
    const due = next
      ? `${next.status === 'late' ? 'en retard depuis le' : 'échéance le'} ${formatShortDate(next.dueDate)}`
      : frequencyLabels[expense.frequency].toLowerCase();
    return {
      id: expense.id,
      title: expense.label,
      icon: expenseCategoryIcons[expense.category],
      badges: <StatusBadge expense={expense} next={next} anchorStatus={anchorStatus} />,
      meta: `${categoryLabels[expense.category]} · ${due}`,
      amount: formatCurrency(expense.amount),
      amountNote: expense.frequency === 'monthly'
        ? '/mois'
        : expense.frequency === 'one_time'
          ? 'unique'
          : `≈ ${formatCurrency(toMonthlyAmount(expense.amount, expense.frequency))}/mois`,
    };
  });
  const opened = expenses.find((expense) => expense.id === openId);
  const openedState = opened && expenseState(opened, today);

  return (
    <div className="space-y-4">
      <CompactRows rows={rows} onOpen={setOpenId} />

      {opened && openedState && (
        <DetailSheet
          title={opened.label}
          onClose={() => setOpenId(null)}
          onEdit={onEdit && (() => { setOpenId(null); onEdit(opened); })}
          onDelete={onDelete && (() => { setOpenId(null); onDelete(opened.id); })}
          deleteLabel="Supprimer cette charge et toutes ses échéances ?"
        >
          <dl className="space-y-2">
            <DetailFact label="Montant">{formatCurrency(opened.amount)}</DetailFact>
            <DetailFact label="Fréquence">{frequencyLabels[opened.frequency]}</DetailFact>
            <DetailFact label="Catégorie">{categoryLabels[opened.category]}</DetailFact>
            {openedState.next && (
              <DetailFact label={openedState.next.status === 'late' ? 'En retard depuis le' : 'Prochaine échéance'}>
                {formatShortDate(openedState.next.dueDate)}
              </DetailFact>
            )}
          </dl>
          <div className="flex flex-wrap gap-2">
            <StatusBadge expense={opened} next={openedState.next} anchorStatus={openedState.anchorStatus} />
            {opened.isRecurring && <Badge variant="neutral">Récurrent</Badge>}
          </div>
          {openedState.next && <OccurrencePayment key={openedState.next.dueDate} occurrence={openedState.next} />}
          {opened.notes && <p className="text-sm italic text-slate-600">{opened.notes}</p>}
        </DetailSheet>
      )}
    </div>
  );
}
