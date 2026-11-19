'use client';

import { useState } from 'react';
import type { Debt, DebtStatus, DebtType } from '@/lib/types';
import { isNonNegativeBudgetAmount } from '@/lib/budget-schema';
import { isLocalDate } from '@/lib/local-date';
import FormField from './FormField';

const cls =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 bg-white';

interface Props {
  initial?: Debt;
  onSubmit: (data: Omit<Debt, 'id'>) => void;
  onCancel: () => void;
}

export default function DebtForm({ initial, onSubmit, onCancel }: Props) {
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    creditor: initial?.creditor ?? '',
    type: (initial?.type ?? 'personal') as DebtType,
    initialAmount: initial?.initialAmount?.toString() ?? '',
    remainingAmount: initial?.remainingAmount?.toString() ?? '',
    monthlyPayment: initial?.monthlyPayment?.toString() ?? '0',
    status: (initial?.status ?? 'to_pay') as DebtStatus,
    nextDueDate: initial?.nextDueDate ?? '',
    isMediationIncluded: initial?.isMediationIncluded ?? false,
    notes: initial?.notes ?? '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setError('');
    setForm((f) => ({ ...f, [k]: v }));
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const initialAmount = parseFloat(form.initialAmount);
    const remainingAmount = parseFloat(form.remainingAmount);
    const monthlyPayment = form.monthlyPayment === '' ? 0 : parseFloat(form.monthlyPayment);
    if (![initialAmount, remainingAmount, monthlyPayment].every(isNonNegativeBudgetAmount)) {
      setError('Renseigne des montants valides et supérieurs ou égaux à zéro.');
      return;
    }
    if (!form.creditor.trim()) return;
    if ((form.nextDueDate || monthlyPayment > 0) && !isLocalDate(form.nextDueDate)) {
      setError('Renseigne une date d’échéance valide.');
      return;
    }
    onSubmit({
      creditor: form.creditor.trim(),
      type: form.type,
      initialAmount,
      remainingAmount,
      monthlyPayment,
      status: form.status,
      nextDueDate: form.nextDueDate || undefined,
      isMediationIncluded: form.isMediationIncluded,
      notes: form.notes.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      <FormField label="Créancier" required hint="Nom de la banque, entreprise ou personne">
        <input
          className={cls}
          value={form.creditor}
          onChange={(e) => set('creditor', e.target.value)}
          placeholder="Ex : BNP Paribas, CPAS…"
          required
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Type de dette">
          <select
            className={cls}
            value={form.type}
            onChange={(e) => set('type', e.target.value as DebtType)}
          >
            <option value="personal">Personnelle</option>
            <option value="shared">Partagée</option>
          </select>
        </FormField>
        <FormField label="Statut">
          <select
            className={cls}
            value={form.status}
            onChange={(e) => set('status', e.target.value as DebtStatus)}
          >
            <option value="to_pay">À rembourser</option>
            <option value="late">En retard</option>
            <option value="contested">Contestée</option>
            <option value="in_mediation">En médiation</option>
            <option value="plan_accepted">Plan accepté</option>
            <option value="suspended">Suspendue</option>
            <option value="completed">Terminée</option>
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Montant initial (€)" required>
          <input
            className={cls}
            type="number"
            min="0"
            step="0.01"
            value={form.initialAmount}
            onChange={(e) => set('initialAmount', e.target.value)}
            placeholder="0,00"
            required
          />
        </FormField>
        <FormField label="Montant restant (€)" required>
          <input
            className={cls}
            type="number"
            min="0"
            step="0.01"
            value={form.remainingAmount}
            onChange={(e) => set('remainingAmount', e.target.value)}
            placeholder="0,00"
            required
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Mensualité (€)">
          <input
            className={cls}
            type="number"
            min="0"
            step="0.01"
            value={form.monthlyPayment}
            onChange={(e) => set('monthlyPayment', e.target.value)}
            placeholder="0,00"
          />
        </FormField>
        <FormField label="Date de la première échéance" required={Number(form.monthlyPayment) > 0}>
          <input
            className={cls}
            type="date"
            required={Number(form.monthlyPayment) > 0}
            value={form.nextDueDate}
            onChange={(e) => set('nextDueDate', e.target.value)}
          />
        </FormField>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="checkbox"
          id="isMediation"
          checked={form.isMediationIncluded}
          onChange={(e) => set('isMediationIncluded', e.target.checked)}
          className="w-4 h-4 accent-teal-500"
        />
        <label htmlFor="isMediation" className="text-sm text-gray-700">
          Incluse dans le dossier de médiation
        </label>
      </div>

      <FormField label="Notes" hint="Optionnel">
        <textarea
          className={cls}
          rows={2}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Remarques, accords particuliers…"
        />
      </FormField>

      {(form.status === 'contested' || form.status === 'in_mediation') && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2 mb-4">
          Renseigne les montants et les dates du plan de remboursement lorsqu&apos;ils sont connus.
        </p>
      )}

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
