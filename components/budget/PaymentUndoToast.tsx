'use client';

import type { Ref } from 'react';

interface PaymentUndoToastProps {
  /** Libellé de l’échéance concernée par le dernier paiement ou la dernière annulation. */
  label?: string;
  paid: boolean;
  error?: string;
  onUndo: () => void;
  undoRef?: Ref<HTMLButtonElement>;
}

/** Confirmation fixe au-dessus de la navigation, avec annulation du dernier paiement. */
export default function PaymentUndoToast({ label, paid, error, onUndo, undoRef }: PaymentUndoToastProps) {
  return (
    <>
      <p role="status" className="sr-only">
        {label && (paid ? `Paiement enregistré pour ${label}.` : `Paiement annulé pour ${label}.`)}
      </p>
      {(paid || error) && (
        <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-2xl px-4 pb-2">
          <div className="rounded-xl border border-teal-900 bg-teal-950 px-3 py-2 text-white shadow-lg">
            {error && <p role="alert" className="py-1 text-sm">{error}</p>}
            {paid && (
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 wrap-break-word text-sm">
                  Paiement enregistré <span className="block text-xs text-teal-100">{label}</span>
                </p>
                <button
                  type="button"
                  ref={undoRef}
                  onClick={onUndo}
                  className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-white underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
