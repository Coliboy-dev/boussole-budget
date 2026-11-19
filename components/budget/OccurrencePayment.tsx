'use client';

import { useState } from 'react';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import { useApp } from '@/lib/context/AppContext';
import type { Occurrence } from '@/lib/occurrences';
import { fromCents } from '@/lib/money';

export default function OccurrencePayment({ occurrence }: { occurrence: Occurrence }) {
  const { recordPayment, cancelExpenseOccurrence } = useApp();
  const [balanceIncludesPayment, setBalanceIncludesPayment] = useState(false);
  const { sourceId: id, dueDate, type, amountCents } = occurrence;
  if (type === 'child') return null;
  const receiving = type === 'income';

  return (
    <details className="mt-2 border-t border-gray-100 pt-2 text-xs">
      <summary className="cursor-pointer font-semibold text-teal-700">
        {receiving ? 'Enregistrer le versement' : 'Enregistrer le paiement'}
      </summary>
      <p className="my-2 text-gray-700">
        {formatCurrency(fromCents(Math.abs(amountCents)))} · Prévu le {formatShortDate(dueDate)}
      </p>
      <label className="my-2 flex items-center gap-2 text-gray-700">
        <input
          type="checkbox"
          checked={balanceIncludesPayment}
          onChange={(event) => setBalanceIncludesPayment(event.target.checked)}
        />
        {receiving ? 'Ce versement est déjà inclus dans mon solde' : 'Ce paiement est déjà déduit de mon solde'}
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-lg bg-teal-700 px-2 py-1 text-white"
          onClick={() => recordPayment({ type, id, dueDate, balanceIncludesPayment })}
        >
          {receiving ? 'Marquer comme reçu' : 'Marquer comme payé'}
        </button>
        {type === 'expense' && (
          <button
            type="button"
            className="font-semibold text-gray-600"
            onClick={() => {
              if (confirm(`Annuler l’échéance du ${formatShortDate(dueDate)} ?`)) {
                cancelExpenseOccurrence(id, dueDate);
              }
            }}
          >
            Annuler cette échéance
          </button>
        )}
      </div>
    </details>
  );
}
