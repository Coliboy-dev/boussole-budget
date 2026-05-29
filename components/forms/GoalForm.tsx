'use client';

import { useState } from 'react';
import type { Goal, GoalStatus } from '@/lib/types';
import FormField from './FormField';

const cls =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 bg-white';

interface Props {
  initial?: Goal;
  onSubmit: (data: Omit<Goal, 'id'>) => void;
  onCancel: () => void;
}

export default function GoalForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState({
    label: initial?.label ?? '',
    targetAmount: initial?.targetAmount?.toString() ?? '',
    savedAmount: initial?.savedAmount?.toString() ?? '0',
    targetDate: initial?.targetDate ?? '',
    monthlyContribution: initial?.monthlyContribution?.toString() ?? '',
    status: (initial?.status ?? 'realistic') as GoalStatus,
    notes: initial?.notes ?? '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetAmount = parseFloat(form.targetAmount);
    const savedAmount = parseFloat(form.savedAmount) || 0;
    const monthlyContribution = parseFloat(form.monthlyContribution) || undefined;
    if (!form.label.trim() || isNaN(targetAmount) || targetAmount <= 0) return;
    onSubmit({
      label: form.label.trim(),
      targetAmount,
      savedAmount,
      targetDate: form.targetDate || undefined,
      monthlyContribution,
      status: form.status,
      notes: form.notes.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormField label="Nom de l'objectif" required>
        <input
          className={cls}
          value={form.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Ex : Vélo pour les enfants, Fonds d'urgence…"
          required
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Montant cible (€)" required>
          <input
            className={cls}
            type="number"
            min="0"
            step="0.01"
            value={form.targetAmount}
            onChange={(e) => set('targetAmount', e.target.value)}
            placeholder="0,00"
            required
          />
        </FormField>
        <FormField label="Déjà épargné (€)">
          <input
            className={cls}
            type="number"
            min="0"
            step="0.01"
            value={form.savedAmount}
            onChange={(e) => set('savedAmount', e.target.value)}
            placeholder="0,00"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Mise de côté /mois (€)" hint="Optionnel">
          <input
            className={cls}
            type="number"
            min="0"
            step="0.01"
            value={form.monthlyContribution}
            onChange={(e) => set('monthlyContribution', e.target.value)}
            placeholder="Ex : 30"
          />
        </FormField>
        <FormField label="Date souhaitée" hint="Optionnel">
          <input
            className={cls}
            type="date"
            value={form.targetDate}
            onChange={(e) => set('targetDate', e.target.value)}
          />
        </FormField>
      </div>

      <FormField label="Réalisme de l'objectif">
        <select
          className={cls}
          value={form.status}
          onChange={(e) => set('status', e.target.value as GoalStatus)}
        >
          <option value="realistic">✅ Réalisable</option>
          <option value="fragile">⚠️ Fragile</option>
          <option value="to_postpone">⏸️ À reporter</option>
        </select>
      </FormField>

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
          className="flex-1 py-3 rounded-xl bg-teal-500 text-white text-sm font-bold hover:bg-teal-600 transition-colors"
        >
          {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}
