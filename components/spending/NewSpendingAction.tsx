'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
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

/** Durée d'affichage de la bulle « Dépense ajoutée · Annuler ». La dépense reste modifiable dans Dépenses du mois. */
export const UNDO_TOAST_MS = 10_000;

/** Émis à l'ouverture de la saisie, pour que l'écran en cours ferme ses propres messages (accueil). */
export const NEW_SPENDING_EVENT = 'capiste:nouvelle-depense';

export default function NewSpendingAction({ onOpen, showTrigger = true, variant = 'button' }: {
  onOpen?: () => void; showTrigger?: boolean; variant?: 'button' | 'nav';
}) {
  const { addSpending, undoLastSpending, lastAddedSpendingId, storageBlocked } = useApp();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [receipt, setReceipt] = useState<{ id: string; label: string; path: string }>();
  const [undone, setUndone] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  // La bulle ne suit pas la personne d'un écran à l'autre : le bouton vit dans la barre du bas, toujours montée.
  const here = receipt?.path === pathname;
  const canUndo = Boolean(here && receipt && receipt.id === lastAddedSpendingId && !storageBlocked && !open);
  const showUndone = here && undone;

  // Elle se ferme seule après quelques secondes.
  useEffect(() => {
    if (!canUndo && !showUndone) return;
    const timer = setTimeout(() => { setReceipt(undefined); setUndone(false); }, UNDO_TOAST_MS);
    return () => clearTimeout(timer);
  }, [canUndo, showUndone, receipt]);

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
          setReceipt({ id, label: `${label}, ${formatCurrency(spending.amount)}`, path: pathname });
          setUndone(false);
          setOpen(false);
        }} />
      )}
      <PaymentUndoToast spending paid={canUndo} label={canUndo || showUndone ? receipt?.label : undefined}
        error={error} onUndo={undo} undoRef={undoButton} />
    </>
  );
}
