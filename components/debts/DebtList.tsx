'use client';

import { useState } from 'react';
import { HandCoins, PartyPopper } from 'lucide-react';
import type { Debt } from '@/lib/types';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import { useApp } from '@/lib/context/AppContext';
import { nextDebtOccurrence } from '@/lib/debt-payoff';
import ProgressBar from '@/components/ui/ProgressBar';
import { Icon } from '@/components/ui/icons';
import { CompactRows, DetailSheet, type CompactRow } from '@/components/budget/CompactRows';
import DebtDetail, { DebtBadges, debtProgress } from './DebtDetail';

interface DebtListProps {
  debts: Debt[];
  onEdit?: (debt: Debt) => void;
  onDelete?: (id: string) => void;
}

export default function DebtList({ debts, onEdit, onDelete }: DebtListProps) {
  const { today } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);

  if (debts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600">
        <Icon icon={PartyPopper} className="mx-auto mb-2 size-9 text-green-700" />
        <p className="text-sm">Aucune dette enregistrée.</p>
      </div>
    );
  }

  const rows: CompactRow[] = debts.map((debt) => {
    const next = nextDebtOccurrence(debt, today);
    const progress = debtProgress(debt);
    const monthly = debt.monthlyPayment > 0 ? `${formatCurrency(debt.monthlyPayment)}/mois` : 'Sans mensualité';
    const due = next && debt.nextDueDate
      ? `${next.status === 'late' ? 'en retard depuis le' : 'échéance le'} ${formatShortDate(next.dueDate)}`
      : null;
    return {
      id: debt.id,
      title: debt.creditor,
      icon: HandCoins,
      tone: debt.status === 'late' ? 'amber' : 'teal',
      badges: debt.status === 'to_pay' && !debt.isMediationIncluded && debt.type !== 'shared'
        ? undefined
        : <DebtBadges debt={debt} />,
      meta: due ? `${monthly} · ${due}` : monthly,
      amount: formatCurrency(debt.remainingAmount),
      amountNote: 'restant',
      footer: debt.initialAmount > 0
        ? <ProgressBar value={progress.percent} color={progress.color} size="sm" />
        : undefined,
    };
  });
  const opened = debts.find((debt) => debt.id === openId);

  return (
    <>
      <CompactRows rows={rows} onOpen={setOpenId} />
      {opened && (
        <DetailSheet
          title={opened.creditor}
          onClose={() => setOpenId(null)}
          onEdit={onEdit && (() => { setOpenId(null); onEdit(opened); })}
          onDelete={onDelete && (() => { setOpenId(null); onDelete(opened.id); })}
          deleteLabel="Supprimer cette dette et son historique de paiements ?"
        >
          <DebtDetail debt={opened} />
        </DetailSheet>
      )}
    </>
  );
}
