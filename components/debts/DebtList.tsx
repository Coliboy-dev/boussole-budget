import DebtCard from './DebtCard';
import type { Debt } from '@/lib/types';

interface DebtListProps {
  debts: Debt[];
}

export default function DebtList({ debts }: DebtListProps) {
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
        <DebtCard key={debt.id} debt={debt} />
      ))}
    </div>
  );
}
