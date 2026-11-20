'use client';

import DebtCard from './DebtCard';
import type { Debt } from '@/lib/types';
import { PartyPopper } from 'lucide-react';
import { Icon } from '@/components/ui/icons';

interface DebtListProps {
  debts: Debt[];
  onEdit?: (debt: Debt) => void;
  onDelete?: (id: string) => void;
}

export default function DebtList({ debts, onEdit, onDelete }: DebtListProps) {
  if (debts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600">
        <Icon icon={PartyPopper} className="mx-auto mb-2 size-9 text-green-700" />
        <p className="text-sm">Aucune dette enregistrée.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {debts.map((debt) => (
        <DebtCard key={debt.id} debt={debt} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}
