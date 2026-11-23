'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/budget-calculations';
import { useApp } from '@/lib/context/AppContext';
import { spendingCategoryLabels } from '@/lib/spending';
import { householdCopy } from '@/lib/household-copy';
import PaymentUndoToast from '@/components/budget/PaymentUndoToast';
import { Icon } from '@/components/ui/icons';
import QuickSpendingSheet from './QuickSpendingSheet';

export default function NewSpendingAction({ onOpen, showTrigger = true }: { onOpen?: () => void; showTrigger?: boolean }) {
  const { addSpending, undoLastSpending, lastAddedSpendingId, storageBlocked } = useApp();
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; label: string }>();
  const [undone, setUndone] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const canUndo = Boolean(receipt && receipt.id === lastAddedSpendingId && !storageBlocked && !open);

  useEffect(() => {
    if (canUndo) undoButton.current?.focus({ preventScroll: true });
  }, [canUndo]);

  function undo() {
    try {
      undoLastSpending();
      setUndone(true);
      setError('');
      trigger.current?.focus({ preventScroll: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible d’annuler cette dépense.');
    }
  }

  return (
    <>
      {showTrigger && <button type="button" ref={trigger} disabled={storageBlocked}
        onClick={() => { onOpen?.(); setError(''); setUndone(false); setOpen(true); }}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
        <Icon icon={Plus} />
        Ajouter une dépense
      </button>}
      {open && (
        <QuickSpendingSheet onClose={() => setOpen(false)} onSave={(spending) => {
          const id = addSpending(spending);
          const label = spending.label ?? (spending.category === 'household' ? householdCopy.transfers : spendingCategoryLabels[spending.category]);
          setReceipt({ id, label: `${label}, ${formatCurrency(spending.amount)}` });
          setUndone(false);
          setOpen(false);
        }} />
      )}
      <PaymentUndoToast spending paid={canUndo} label={canUndo || undone ? receipt?.label : undefined}
        error={error} onUndo={undo} undoRef={undoButton} />
    </>
  );
}
