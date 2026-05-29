'use client';

import { useState } from 'react';
import type { Expense, ExpenseCategory, Frequency } from '@/lib/types';
import FormField from './FormField';

const cls =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 bg-white';

interface Props {
  initial?: Expense;
  onSubmit: (data: Omit<Expense, 'id'>) => void;
  onCancel: () => void;
}

export default function ExpenseForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState({
    label: initial?.label ?? '',
    category: (initial?.category ?? 'other') as ExpenseCategory,
    amount: initial?.amount?.toString() ?? '',
    frequency: (initial?.frequency ?? 'monthly') as Frequency,
    dueDate: initial?.dueDate ?? '',
    isPaid: initial?.isPaid ?? false,
    isRecurring: initial?.isRecurring ?? true,
    notes: initial?.notes ?? '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.label.trim() || isNaN(amount) || amount <= 0) return;
    onSubmit({
      label: form.label.trim(),
      category: form.category,
      amount,
      frequency: form.frequency,
      dueDate: form.dueDate || undefined,
      isPaid: form.isPaid,
      isRecurring: form.isRecurring,
      notes: form.notes.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormField label="Intitulé" required>
        <input
          className={cls}
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
        <FormField label="Montant (€)" required>
          <input
            className={cls}
            type="number"
            min="0"
            step="0.01"
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

      <FormField label="Date de prochaine échéance" hint="Optionnel">
        <input
          className={cls}
          type="date"
          value={form.dueDate}
          onChange={(e) => set('dueDate', e.target.value)}
        />
      </FormField>

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="isRecurring"
            checked={form.isRecurring}
            onChange={(e) => set('isRecurring', e.target.checked)}
            className="w-4 h-4 accent-teal-500"
          />
          <label htmlFor="isRecurring" className="text-sm text-gray-700">
            Charge récurrente
          </label>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="isPaid"
            checked={form.isPaid}
            onChange={(e) => set('isPaid', e.target.checked)}
            className="w-4 h-4 accent-teal-500"
          />
          <label htmlFor="isPaid" className="text-sm text-gray-700">
            Déjà payé ce mois-ci
          </label>
        </div>
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
          className="flex-1 py-3 rounded-xl bg-teal-500 text-white text-sm font-bold hover:bg-teal-600 transition-colors"
        >
          {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}
