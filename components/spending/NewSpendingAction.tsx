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

/** Le déclencheur « tuile » sert aux actions rapides de l'accueil (Élan V3) ; le libellé accessible ne change pas. */
export const quickActionTile = 'flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl px-2 py-3 text-center text-xs font-semibold leading-tight';

export default function NewSpendingAction({ onOpen, showTrigger = true, variant = 'button' }: {
  onOpen?: () => void; showTrigger?: boolean; variant?: 'button' | 'tile';
}) {
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
        className={variant === 'tile'
          ? `${quickActionTile} bg-cap-primary text-cap-on-primary hover:bg-cap-primary-strong disabled:opacity-50`
          : 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50'}>
        <Icon icon={Plus} className={variant === 'tile' ? 'size-6' : undefined} />
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
