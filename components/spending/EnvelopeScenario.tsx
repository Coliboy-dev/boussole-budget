'use client';

import { useState, type FormEvent } from 'react';
import FormField from '@/components/forms/FormField';
import { useFormValidation } from '@/components/forms/useFormValidation';
import Card from '@/components/ui/Card';
import { calculateBudgetSummary, formatCurrency } from '@/lib/budget-calculations';
import { isNonNegativeBudgetAmount } from '@/lib/budget-schema';
import { useApp } from '@/lib/context/AppContext';
import { parseAmountInput } from '@/lib/money';
import { envelopesOf, spendingsOf, upsertEnvelope } from '@/lib/spending';
import type { Envelope } from '@/lib/types';

export default function EnvelopeScenario({ envelope, onApplied }: { envelope: Envelope; onApplied: () => void }) {
  const state = useApp();
  const [amount, setAmount] = useState(String(envelope.monthlyAmount));
  const { errors, validate, clearFieldError } = useFormValidation();
  const monthlyAmount = parseAmountInput(amount);
  const validAmount = isNonNegativeBudgetAmount(monthlyAmount);
  const updated = { ...envelope, monthlyAmount };
  const preview = validAmount ? upsertEnvelope(state, updated) : undefined;
  const forecast = preview && calculateBudgetSummary(
    preview.currentBalance, preview.incomes, preview.expenses, preview.debts,
    preview.childExpenses, preview.userProfile.safetyReserve, preview.goals, state.today,
    { envelopes: envelopesOf(preview), spendings: spendingsOf(preview) },
  );

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate(event.currentTarget, {
      amount: validAmount ? undefined : 'Saisis un montant positif ou nul, avec deux décimales au maximum.',
    }) || state.storageBlocked) return;
    state.saveEnvelope(updated);
    onApplied();
  }

  return (
    <Card padding="sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Et si tu ajustais ton enveloppe ?</h3>
      <form onSubmit={apply} onChange={clearFieldError} noValidate>
        <FormField label="Nouveau montant mensuel (€)" required error={errors.amount}>
          <input name="amount" type="number" inputMode="decimal" min="0" step="0.01" required
            className="w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-base"
            value={amount} onChange={(event) => setAmount(event.target.value)} />
        </FormField>
        <p role="status" className="mb-3 text-sm text-slate-700">
          {forecast && <>Ton vrai disponible passerait de <strong>{formatCurrency(state.summary.trueAvailable)}</strong>{' '}
            à <strong>{formatCurrency(forecast.trueAvailable)}</strong>.</>}
        </p>
        <button type="submit" disabled={state.storageBlocked}
          className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
          Appliquer
        </button>
      </form>
    </Card>
  );
}
