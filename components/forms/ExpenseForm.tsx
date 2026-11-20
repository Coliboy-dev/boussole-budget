'use client';

import { useState } from 'react';
import type { Expense, ExpenseCategory, Frequency } from '@/lib/types';
import { isNonNegativeBudgetAmount } from '@/lib/budget-schema';
import { isLocalDate } from '@/lib/local-date';
import FormField from './FormField';
import { useFormValidation } from './useFormValidation';

const cls =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-teal-400 bg-white';

interface Props {
  initial?: Expense;
  onSubmit: (data: Omit<Expense, 'id'>) => void;
  onCancel: () => void;
}

export default function ExpenseForm({ initial, onSubmit, onCancel }: Props) {
  const { errors, validate, clearFieldError } = useFormValidation();
  const [form, setForm] = useState({
    label: initial?.label ?? '',
    category: (initial?.category ?? 'other') as ExpenseCategory,
    amount: initial?.amount?.toString() ?? '',
    frequency: (initial && !initial.isRecurring ? 'one_time' : initial?.frequency ?? 'monthly') as Frequency,
    dueDate: initial?.dueDate ?? '',
    endDate: initial?.endDate ?? '',
    isPaid: initial?.isPaid ?? false,
    notes: initial?.notes ?? '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    const isRecurring = form.frequency !== 'one_time';
    if (!validate(e.currentTarget, {
      label: form.label.trim() ? undefined : 'Renseigne l’intitulé de la charge.',
      amount: isNonNegativeBudgetAmount(amount) && amount > 0 ? undefined : 'Saisis un montant valide supérieur à zéro.',
      dueDate: isLocalDate(form.dueDate) ? undefined : 'Renseigne une date d’échéance valide.',
      endDate: form.endDate && !isLocalDate(form.endDate) ? 'Renseigne une date de fin valide.' : undefined,
    })) return;
    onSubmit({
      label: form.label.trim(),
      category: form.category,
      amount,
      frequency: form.frequency,
      dueDate: form.dueDate,
      endDate: isRecurring ? form.endDate || undefined : undefined,
      isPaid: false,
      isRecurring,
      occurrenceStatuses: form.isPaid && !initial?.dueDate
        ? { ...initial?.occurrenceStatuses, [form.dueDate]: 'paid' }
        : initial?.occurrenceStatuses,
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
          placeholder="Ex : Loyer, Énergie…"
          required
        />
      </FormField>

      <FormField label="Catégorie">
        <select
          className={cls}
          value={form.category}
          onChange={(e) => set('category', e.target.value as ExpenseCategory)}
        >
          <option value="rent">🏠 Logement</option>
          <option value="energy">⚡ Énergie</option>
          <option value="phone">📱 Téléphone / Internet</option>
          <option value="insurance">🛡️ Assurance</option>
          <option value="groceries">🛒 Courses alimentaires</option>
          <option value="transport">🚌 Transport</option>
          <option value="health">💊 Santé / Mutuelle</option>
          <option value="school">📚 Scolarité</option>
          <option value="subscriptions">📺 Abonnements</option>
          <option value="other">💸 Autre</option>
        </select>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Montant (€)" required error={errors.amount}>
          <input
            className={cls}
            type="number"
            min="0"
            step="0.01"
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

      <FormField label={form.frequency === 'one_time' ? 'Date d’échéance' : '1re échéance'} required error={errors.dueDate}>
        <input
          className={cls}
          type="date"
          required
          name="dueDate"
          value={form.dueDate}
          onChange={(e) => set('dueDate', e.target.value)}
        />
      </FormField>

      {form.frequency !== 'one_time' && (
        <FormField label="Fin de la récurrence" hint="Optionnel" error={errors.endDate}>
          <input
            className={cls}
            type="date"
            min={form.dueDate || undefined}
            name="endDate"
            value={form.endDate}
            onChange={(e) => set('endDate', e.target.value)}
          />
        </FormField>
      )}

      {!initial?.dueDate && (
        <div className="flex items-center gap-3 mb-4">
          <input
            type="checkbox"
            id="isPaid"
            checked={form.isPaid}
            onChange={(e) => set('isPaid', e.target.checked)}
            className="w-4 h-4 accent-teal-500"
          />
          <label htmlFor="isPaid" className="text-sm text-gray-700">
            Déjà payé et inclus dans mon solde
          </label>
        </div>
      )}

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
