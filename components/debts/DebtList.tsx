'use client';

import DebtCard from './DebtCard';
import type { Debt } from '@/lib/types';

interface DebtListProps {
  debts: Debt[];
  onEdit?: (debt: Debt) => void;
  onDelete?: (id: string) => void;
}

export default function DebtList({ debts, onEdit, onDelete }: DebtListProps) {
  if (debts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-4xl mb-2">🎉</p>
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
