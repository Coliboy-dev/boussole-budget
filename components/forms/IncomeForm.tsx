'use client';

import { useState } from 'react';
import type { Income, IncomeType, Frequency } from '@/lib/types';
import { isNonNegativeBudgetAmount } from '@/lib/budget-schema';
import { amountInputValue, parseAmountInput } from '@/lib/money';
import { isLocalDate } from '@/lib/local-date';
import FormField, { amountField } from './FormField';
import { useFormValidation } from './useFormValidation';

const cls =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-teal-400 bg-white';

interface Props {
  initial?: Income;
  onSubmit: (data: Omit<Income, 'id'>) => void;
  onCancel: () => void;
}

export default function IncomeForm({ initial, onSubmit, onCancel }: Props) {
  const { errors, validate, clearFieldError } = useFormValidation();
  const [form, setForm] = useState({
    label: initial?.label ?? '',
    type: (initial?.type ?? 'other') as IncomeType,
    amount: amountInputValue(initial?.amount) ?? '',
    frequency: (initial?.frequency ?? 'monthly') as Frequency,
    expectedDate: initial?.expectedDate ?? '',
    endDate: initial?.endDate ?? '',
    isConfirmed: initial?.isConfirmed ?? true,
    notes: initial?.notes ?? '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amount = parseAmountInput(form.amount);
    if (!validate(e.currentTarget, {
      label: form.label.trim() ? undefined : 'Renseigne l’intitulé du revenu.',
      amount: isNonNegativeBudgetAmount(amount) && amount > 0 ? undefined : 'Saisis un montant valide supérieur à zéro.',
      expectedDate: isLocalDate(form.expectedDate) ? undefined : 'Renseigne une date de versement valide.',
      endDate: form.endDate && !isLocalDate(form.endDate) ? 'Renseigne une date de fin valide.' : undefined,
    })) return;
    onSubmit({
      label: form.label.trim(),
      type: form.type,
      amount,
      frequency: form.frequency,
      expectedDate: form.expectedDate,
      endDate: form.frequency === 'one_time' ? undefined : form.endDate || undefined,
      isConfirmed: form.isConfirmed,
      notes: form.notes.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} onChange={clearFieldError} noValidate>
      <FormField label="Intitulé" required error={errors.label}>
        <input
          className={cls}
          name="label"
          value={form.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Ex : Indemnité mutuelle"
          required
        />
      </FormField>

      <FormField label="Type de revenu">
        <select
          className={cls}
          value={form.type}
          onChange={(e) => set('type', e.target.value as IncomeType)}
        >
          <option value="mutual_insurance">Indemnité mutuelle</option>
          <option value="allocation">Allocation familiale</option>
          <option value="alimony">Pension alimentaire</option>
          <option value="salary">Salaire</option>
          <option value="freelance">Freelance / indépendant</option>
          <option value="other">Autre</option>
        </select>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Montant (€)" required error={errors.amount}>
          <input
            className={cls}
            {...amountField}
            name="amount"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            placeholder="0,00"
            required
          />
        </FormField>
        <FormField label="Fréquence">
          <select
            className={cls}
            value={form.frequency}
            onChange={(e) => set('frequency', e.target.value as Frequency)}
          >
            <option value="monthly">Mensuel</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="bi_monthly">Tous les 2 mois</option>
            <option value="quarterly">Trimestriel</option>
            <option value="annual">Annuel</option>
            <option value="one_time">Unique</option>
          </select>
        </FormField>
      </div>

      <FormField label={form.frequency === 'one_time' ? 'Date du versement' : 'Date du premier versement'} required error={errors.expectedDate}>
        <input
          className={cls}
          type="date"
          required
          name="expectedDate"
          value={form.expectedDate}
          onChange={(e) => set('expectedDate', e.target.value)}
        />
      </FormField>

      {form.frequency !== 'one_time' && (
        <FormField label="Fin de la récurrence" hint="Optionnel" error={errors.endDate}>
          <input
            className={cls}
            type="date"
            min={form.expectedDate || undefined}
            name="endDate"
            value={form.endDate}
            onChange={(e) => set('endDate', e.target.value)}
          />
        </FormField>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input
          type="checkbox"
          id="isConfirmed"
          checked={form.isConfirmed}
          onChange={(e) => set('isConfirmed', e.target.checked)}
          className="w-4 h-4 accent-teal-500 rounded"
        />
        <label htmlFor="isConfirmed" className="text-sm text-gray-700">
          Revenu confirmé (pas incertain)
        </label>
      </div>

      <FormField label="Notes" hint="Optionnel">
        <textarea
          className={cls}
          rows={2}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Remarques éventuelles…"
        />
      </FormField>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="flex-1 py-3 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 transition-colors"
        >
          {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}
