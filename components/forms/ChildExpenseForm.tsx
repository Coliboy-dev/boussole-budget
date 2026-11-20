'use client';

import { useState } from 'react';
import type { ChildExpense, ChildExpenseCategory, ChildExpenseStatus } from '@/lib/types';
import { isNonNegativeBudgetAmount } from '@/lib/budget-schema';
import { isLocalDate, todayInBrussels } from '@/lib/local-date';
import FormField from './FormField';
import { useFormValidation } from './useFormValidation';

const cls =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700 focus:border-teal-400 bg-white';

interface Props {
  initial?: ChildExpense;
  onSubmit: (data: Omit<ChildExpense, 'id'>) => void;
  onCancel: () => void;
}

export default function ChildExpenseForm({ initial, onSubmit, onCancel }: Props) {
  const { errors, validate, clearFieldError } = useFormValidation();
  const [form, setForm] = useState({
    childName: initial?.childName ?? '',
    label: initial?.label ?? '',
    category: (initial?.category ?? 'other') as ChildExpenseCategory,
    totalAmount: initial?.totalAmount?.toString() ?? '',
    paidByUser: initial?.paidByUser?.toString() ?? '',
    shareAmount: initial?.shareAmount?.toString() ?? '0',
    status: (initial?.status ?? 'pending') as ChildExpenseStatus,
    date: initial?.date ?? todayInBrussels(),
    reimbursementDate: initial?.reimbursementDate ?? '',
    receiptSent: initial?.receiptSent ?? false,
    receiptReference: initial?.receiptReference ?? '',
    notes: initial?.notes ?? '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const totalAmount = parseFloat(form.totalAmount);
    const paidByUser = parseFloat(form.paidByUser);
    const shareAmount = parseFloat(form.shareAmount) || 0;
    if (!validate(e.currentTarget, {
      label: form.label.trim() ? undefined : 'Renseigne la description du frais.',
      totalAmount: isNonNegativeBudgetAmount(totalAmount) ? undefined : 'Saisis un montant total valide et positif ou nul.',
      paidByUser: isNonNegativeBudgetAmount(paidByUser) ? undefined : 'Saisis un montant payé valide et positif ou nul.',
      shareAmount: isNonNegativeBudgetAmount(shareAmount) ? undefined : 'Saisis une part à rembourser valide et positive ou nulle.',
      date: isLocalDate(form.date) ? undefined : 'Renseigne une date de paiement valide.',
      reimbursementDate: form.reimbursementDate && !isLocalDate(form.reimbursementDate)
        ? 'Renseigne une date de remboursement valide.' : undefined,
    })) return;
    onSubmit({
      childName: form.childName.trim() || undefined,
      label: form.label.trim(),
      category: form.category,
      totalAmount,
      paidByUser,
      shareAmount,
      status: form.status,
      date: form.date,
      reimbursementDate: form.status === 'reimbursed' ? undefined : form.reimbursementDate || undefined,
      receiptSent: form.receiptSent,
      receiptReference: form.receiptReference.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} onChange={clearFieldError} noValidate>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Prénom de l'enfant" hint="Optionnel">
          <input
            className={cls}
            value={form.childName}
            onChange={(e) => set('childName', e.target.value)}
            placeholder="Ex : Léa, Tom…"
          />
        </FormField>
        <FormField label="Catégorie">
          <select
            className={cls}
            value={form.category}
            onChange={(e) => set('category', e.target.value as ChildExpenseCategory)}
          >
            <option value="school">Scolarité</option>
            <option value="clothing">Vêtements</option>
            <option value="activities">Activités</option>
            <option value="health">Santé</option>
            <option value="transport">Transport</option>
            <option value="other">Autre</option>
          </select>
        </FormField>
      </div>

      <FormField label="Description" required error={errors.label}>
        <input
          className={cls}
          name="label"
          value={form.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Ex : Chaussures de sport, visite médicale…"
          required
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Montant total (€)" required error={errors.totalAmount}>
          <input
            className={cls}
            type="number"
            min="0"
            step="0.01"
            name="totalAmount"
            value={form.totalAmount}
            onChange={(e) => set('totalAmount', e.target.value)}
            placeholder="0,00"
            required
          />
        </FormField>
        <FormField label="Payé par toi (€)" required error={errors.paidByUser}>
          <input
            className={cls}
            type="number"
            min="0"
            step="0.01"
            name="paidByUser"
            value={form.paidByUser}
            onChange={(e) => set('paidByUser', e.target.value)}
            placeholder="0,00"
            required
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Part à partager (€)" hint="Montant à rembourser" error={errors.shareAmount}>
          <input
            className={cls}
            type="number"
            min="0"
            step="0.01"
            name="shareAmount"
            value={form.shareAmount}
            onChange={(e) => set('shareAmount', e.target.value)}
            placeholder="0,00"
          />
        </FormField>
        <FormField label="Date" required error={errors.date}>
          <input
            className={cls}
            type="date"
            name="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            required
          />
        </FormField>
      </div>

      <FormField label="Statut">
        <select
          className={cls}
          value={form.status}
          onChange={(e) => set('status', e.target.value as ChildExpenseStatus)}
        >
          <option value="paid">Payé</option>
          <option value="pending">En attente de remboursement</option>
          <option value="reimbursed">Remboursé</option>
          <option value="receipt_sent">Justificatif envoyé</option>
        </select>
      </FormField>

      {form.status !== 'reimbursed' && Number(form.shareAmount) > 0 && (
        <FormField label="Remboursement attendu le" hint="Optionnel, affiché comme revenu incertain" error={errors.reimbursementDate}>
          <input
            className={cls}
            type="date"
            name="reimbursementDate"
            value={form.reimbursementDate}
            onChange={(e) => set('reimbursementDate', e.target.value)}
          />
        </FormField>
      )}

      <FormField label="Référence du justificatif" hint="Optionnel">
        <input
          className={cls}
          value={form.receiptReference}
          onChange={(e) => set('receiptReference', e.target.value)}
          placeholder="Ex. facture F-2026-015"
        />
      </FormField>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="checkbox"
          id="receiptSent"
          checked={form.receiptSent}
          onChange={(e) => set('receiptSent', e.target.checked)}
          className="w-4 h-4 accent-teal-500"
        />
        <label htmlFor="receiptSent" className="text-sm text-gray-700">
          Justificatif envoyé à l&apos;autre parent
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
