'use client';

import { useState } from 'react';
import type { Goal } from '@/lib/types';
import { isNonNegativeBudgetAmount } from '@/lib/budget-schema';
import { amountInputValue, parseAmountInput, parseOptionalAmount } from '@/lib/money';
import { isLocalDate } from '@/lib/local-date';
import FormField, { amountField, readDateInput } from './FormField';
import { useFormValidation } from './useFormValidation';

const cls =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-teal-400 bg-white';

interface Props {
  initial?: Goal;
  onSubmit: (data: Omit<Goal, 'id' | 'status'>) => void;
  onCancel: () => void;
}

export default function GoalForm({ initial, onSubmit, onCancel }: Props) {
  const { errors, validate, clearFieldError } = useFormValidation();
  const [form, setForm] = useState({
    label: initial?.label ?? '',
    targetAmount: amountInputValue(initial?.targetAmount) ?? '',
    savedAmount: amountInputValue(initial?.savedAmount) ?? '0',
    monthlyContribution: amountInputValue(initial?.monthlyContribution) ?? '',
    // Objectif existant sans réponse : épargne considérée à part, comme avant.
    place: (initial ? (initial.onCurrentAccount ? 'current' : 'separate') : '') as '' | 'current' | 'separate',
    notes: initial?.notes ?? '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const targetDate = readDateInput(e.currentTarget, 'targetDate');
    const targetAmount = parseAmountInput(form.targetAmount);
    const savedAmount = parseOptionalAmount(form.savedAmount, 0);
    const monthlyContribution = form.monthlyContribution.trim() === '' ? undefined : parseAmountInput(form.monthlyContribution);
    if (!validate(e.currentTarget, {
      label: form.label.trim() ? undefined : 'Renseigne le nom de l’objectif.',
      targetAmount: isNonNegativeBudgetAmount(targetAmount) && targetAmount > 0 ? undefined : 'Saisis un montant cible valide supérieur à zéro.',
      savedAmount: isNonNegativeBudgetAmount(savedAmount) ? undefined : 'Saisis un montant épargné valide et positif ou nul.',
      monthlyContribution: isNonNegativeBudgetAmount(monthlyContribution ?? 0) ? undefined : 'Saisis une contribution valide et positive ou nulle.',
      targetDate: targetDate && !isLocalDate(targetDate) ? 'Renseigne une date cible valide.' : undefined,
      place: form.place ? undefined : 'Indique où tu gardes cet argent.',
    })) return;
    onSubmit({
      label: form.label.trim(),
      targetAmount,
      savedAmount,
      targetDate: targetDate || undefined,
      monthlyContribution,
      onCurrentAccount: form.place === 'current',
      ...(initial?.lastContributionMonth && { lastContributionMonth: initial.lastContributionMonth }),
      notes: form.notes.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} onChange={clearFieldError} noValidate>
      <FormField label="Nom de l'objectif" required error={errors.label}>
        <input
          className={cls}
          name="label"
          value={form.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Ex : Vélo pour les enfants, Fonds d'urgence…"
          required
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Montant cible (€)" required error={errors.targetAmount}>
          <input
            className={cls}
            {...amountField}
            name="targetAmount"
            value={form.targetAmount}
            onChange={(e) => set('targetAmount', e.target.value)}
            placeholder="0,00"
            required
          />
        </FormField>
        <FormField label="Déjà épargné (€)" error={errors.savedAmount}>
          <input
            className={cls}
            {...amountField}
            name="savedAmount"
            value={form.savedAmount}
            onChange={(e) => set('savedAmount', e.target.value)}
            placeholder="0,00"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Mise de côté /mois (€)" hint="Optionnel" error={errors.monthlyContribution}>
          <input
            className={cls}
            {...amountField}
            name="monthlyContribution"
            value={form.monthlyContribution}
            onChange={(e) => set('monthlyContribution', e.target.value)}
            placeholder="Ex : 30"
          />
        </FormField>
        <FormField label="Date souhaitée" hint="Optionnel" error={errors.targetDate}>
          <input
            className={cls}
            type="date"
            name="targetDate"
            defaultValue={initial?.targetDate}
          />
        </FormField>
      </div>

      <fieldset className="mb-4" aria-describedby={errors.place ? 'goal-place-error' : undefined}>
        <legend className="mb-1.5 text-sm font-semibold text-gray-700">Où gardes-tu cet argent ? *</legend>
        {([
          ['current', 'Sur mon compte courant', 'Capiste le réserve : il ne compte plus dans ton vrai disponible.'],
          ['separate', 'Sur un compte épargne', 'Il est déjà à part : seules les mises de côté à venir sont retirées.'],
        ] as const).map(([value, label, hint]) => (
          <label key={value} className="mb-2 flex min-h-11 items-start gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm">
            {/* Pas d'attribut required : le message précis vient de la règle « place » ci-dessus. */}
            <input type="radio" name="place" value={value} checked={form.place === value}
              onChange={() => set('place', value)} className="mt-0.5 size-5 shrink-0 accent-teal-700" />
            <span><span className="block font-semibold text-gray-800">{label}</span><span className="block text-xs text-gray-600">{hint}</span></span>
          </label>
        ))}
        {errors.place && <p id="goal-place-error" role="alert" className="text-xs text-red-700">{errors.place}</p>}
      </fieldset>

      <FormField label="Notes" hint="Optionnel">
        <textarea
          className={cls}
          rows={2}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Pourquoi cet objectif est important pour toi…"
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
