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

/** Tuile des actions rapides de l'accueil (Élan V3). */
export const quickActionTile = 'flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl px-2 py-3 text-center text-xs font-semibold leading-tight';

/** Émis à l'ouverture de la saisie, pour que l'écran en cours ferme ses propres messages (accueil). */
export const NEW_SPENDING_EVENT = 'capiste:nouvelle-depense';

export default function NewSpendingAction({ onOpen, showTrigger = true, variant = 'button' }: {
  onOpen?: () => void; showTrigger?: boolean; variant?: 'button' | 'nav';
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
      {showTrigger && variant === 'nav' && (
        // Action du quotidien : au centre de la barre du bas, sous le pouce, sur tous les écrans.
        <button type="button" ref={trigger} disabled={storageBlocked} aria-label="Ajouter une dépense"
          onClick={() => { window.dispatchEvent(new Event(NEW_SPENDING_EVENT)); onOpen?.(); setError(''); setUndone(false); setOpen(true); }}
          className="group flex flex-col items-center justify-center gap-0.5 text-xs font-semibold text-cap-primary-text disabled:opacity-50">
          <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-cap-primary text-cap-on-primary shadow-md group-hover:bg-cap-primary-strong">
            <Icon icon={Plus} className="size-6" strokeWidth={2.4} />
          </span>
          Dépense
        </button>
      )}
      {showTrigger && variant === 'button' && <button type="button" ref={trigger} disabled={storageBlocked}
        onClick={() => { window.dispatchEvent(new Event(NEW_SPENDING_EVENT)); onOpen?.(); setError(''); setUndone(false); setOpen(true); }}
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
