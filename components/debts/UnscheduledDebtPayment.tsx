'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatCurrency } from '@/lib/budget-calculations';
import { isBudgetAmount } from '@/lib/budget-schema';
import { useApp } from '@/lib/context/AppContext';
import type { Debt } from '@/lib/types';
import FormField, { amountField } from '@/components/forms/FormField';
import { parseAmountInput } from '@/lib/money';
import { useFormValidation } from '@/components/forms/useFormValidation';

export default function UnscheduledDebtPayment({ debt }: { debt: Debt }) {
  const { recordUnscheduledDebtPayment, storageBlocked } = useApp();
  const validation = useFormValidation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const status = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (message) status.current?.focus({ preventScroll: true });
  }, [message]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = parseAmountInput(String(data.get('amount') ?? ''));
    const balanceIncludesPayment = data.has('alreadyDebited');
    setError('');
    if (!validation.validate(event.currentTarget, {
      amount: isBudgetAmount(amount) && amount > 0 && amount <= debt.remainingAmount
        ? undefined : `Saisis un montant entre 0,01 € et ${formatCurrency(debt.remainingAmount)}.`,
    })) return;

    try {
      recordUnscheduledDebtPayment({ id: debt.id, amount, balanceIncludesPayment });
      setMessage(`Paiement de ${formatCurrency(amount)} enregistré.`);
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Impossible d’enregistrer le paiement.');
    }
  }

  if (!message && (debt.status === 'completed' || debt.remainingAmount <= 0)) return null;

  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <p ref={status} tabIndex={-1} role="status" className={message ? 'text-sm font-semibold text-teal-800' : 'sr-only'}>{message}</p>
      {debt.status !== 'completed' && debt.remainingAmount > 0 && (
        <details open={open} onToggle={(event) => {
          setOpen(event.currentTarget.open);
          if (event.currentTarget.open) setMessage('');
        }}>
          <summary className="cursor-pointer py-3 text-sm font-semibold text-teal-800">
            Enregistrer un paiement
          </summary>
          {open && (
            <form onSubmit={submit} onChange={validation.clearFieldError} noValidate>
              <FormField label="Montant du paiement (€)" required error={validation.errors.amount}>
                <input name="amount" {...amountField} required
                  className="w-full rounded-lg border border-gray-400 px-3 py-2 text-sm" />
              </FormField>
              <label className="my-2 flex items-center gap-2 text-sm text-gray-700">
                <input name="alreadyDebited" type="checkbox" />
                Ce paiement est déjà déduit de mon solde
              </label>
              {error && <p role="alert" className="mb-2 text-sm text-red-800">{error}</p>}
              <button type="submit" disabled={storageBlocked}
                className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Enregistrer le paiement
              </button>
            </form>
          )}
        </details>
      )}
    </div>
  );
}
