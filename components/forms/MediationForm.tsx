'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import FormField from './FormField';
import { useFormValidation } from './useFormValidation';
import { formatCurrency } from '@/lib/budget-calculations';
import { isNonNegativeBudgetAmount } from '@/lib/budget-schema';
import { isLocalDate } from '@/lib/local-date';
import { fromCents, parseAmountInput, toCents } from '@/lib/money';
import type { Income, MediationFile } from '@/lib/types';

const inputClass = 'w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-sm';

interface Props {
  initial: MediationFile;
  incomes: readonly Income[];
  onSave: (data: Partial<MediationFile>) => void;
  onCancel: () => void;
}

export default function MediationForm({ initial, incomes, onSave, onCancel }: Props) {
  const { validate, errors, clearFieldError } = useFormValidation();
  const [saveError, setSaveError] = useState('');
  const existingPlan = initial.proposedPlan;
  const missingAllowance = initial.allowanceIncomeId && !incomes.some(({ id }) => id === initial.allowanceIncomeId);
  const initialQuestions = initial.questionsForMediator.join('\n');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError('');
    const form = new FormData(event.currentTarget);
    const procedure = String(form.get('procedure') ?? '');
    const allowanceIncomeId = String(form.get('allowance') ?? '');
    const mediatorOrganization = String(form.get('organization') ?? '').trim();
    const nextAppointment = String(form.get('appointment') ?? '');
    const questions = String(form.get('questions') ?? '');
    const total = String(form.get('total') ?? '').trim();
    const monthly = String(form.get('monthly') ?? '').trim();
    const months = String(form.get('months') ?? '').trim();
    const hasPlan = Boolean(existingPlan || total || monthly || months);
    const totalAmount = parseAmountInput(total);
    const monthlyPayment = parseAmountInput(monthly);
    const duration = months ? Number(months) : NaN;

    if (!validate(event.currentTarget, {
      appointment: nextAppointment && !isLocalDate(nextAppointment) ? 'Renseigne une date de rendez-vous valide.' : undefined,
      total: hasPlan && !isNonNegativeBudgetAmount(totalAmount) ? 'Saisis le montant total du plan, positif ou nul.' : undefined,
      monthly: hasPlan && !isNonNegativeBudgetAmount(monthlyPayment) ? 'Saisis le versement mensuel, positif ou nul.' : undefined,
      months: hasPlan && (!Number.isSafeInteger(duration) || duration < 0) ? 'Saisis une durée en mois entiers.' : undefined,
    })) return;

    const changes: Partial<MediationFile> = {
      procedure: procedure === 'amicable' || procedure === 'collective' ? procedure : undefined,
      allowanceIncomeId: allowanceIncomeId || undefined,
      mediatorOrganization: mediatorOrganization || undefined,
      nextAppointment: nextAppointment || undefined,
    };
    if (hasPlan) {
      changes.proposedPlan = {
        ...existingPlan,
        totalAmount: fromCents(toCents(totalAmount)),
        monthlyPayment: fromCents(toCents(monthlyPayment)),
        duration,
        acceptedCreditors: existingPlan?.acceptedCreditors ?? [],
        refusedCreditors: existingPlan?.refusedCreditors ?? [],
      };
    }
    if (questions !== initialQuestions) {
      changes.questionsForMediator = questions.split('\n').map((question) => question.trim()).filter(Boolean);
    }
    try {
      onSave(changes);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Impossible d’enregistrer ce suivi.');
    }
  }

  return (
    <form onSubmit={submit} onChange={clearFieldError} noValidate>
      <FormField label="Type de suivi">
        <select name="procedure" className={inputClass} defaultValue={initial.procedure ?? ''}>
          <option value="">À préciser</option>
          <option value="amicable">Médiation de dettes amiable</option>
          <option value="collective">Règlement collectif de dettes</option>
        </select>
      </FormField>
      <FormField label="Rentrée associée au pécule" hint="Choisis une rentrée de ton budget.">
        <select name="allowance" className={inputClass} defaultValue={initial.allowanceIncomeId ?? ''}>
          <option value="">Aucune rentrée associée</option>
          {missingAllowance && <option value={initial.allowanceIncomeId}>Rentrée indisponible</option>}
          {incomes.map(({ id, label, amount }) => (
            <option key={id} value={id}>{label} · {formatCurrency(amount)}</option>
          ))}
        </select>
      </FormField>
      {incomes.length === 0 && (
        <Link href="/revenus" className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline">
          Ajouter une rentrée dans Revenus
        </Link>
      )}
      <FormField label="Service" hint="Optionnel">
        <input name="organization" className={inputClass} defaultValue={initial.mediatorOrganization ?? ''} />
      </FormField>
      <FormField label="Date du prochain rendez-vous" hint="Optionnel" error={errors.appointment}>
        <input name="appointment" type="date" className={inputClass} defaultValue={initial.nextAppointment ?? ''} />
      </FormField>

      <fieldset className="min-w-0 space-y-2 pt-1">
        <legend className="font-semibold text-gray-900">Plan communiqué</legend>
        <p className="text-xs text-gray-700">Recopie les trois valeurs du plan si tu en as reçu un.</p>
        <FormField label="Montant total du plan (€)" error={errors.total}>
          <input name="total" inputMode="decimal" className={inputClass} defaultValue={existingPlan?.totalAmount ?? ''} />
        </FormField>
        <FormField label="Versement mensuel (€)" error={errors.monthly}>
          <input name="monthly" inputMode="decimal" className={inputClass} defaultValue={existingPlan?.monthlyPayment ?? ''} />
        </FormField>
        <FormField label="Durée (mois)" error={errors.months}>
          <input name="months" type="number" min="0" step="1" className={inputClass} defaultValue={existingPlan?.duration ?? ''} />
        </FormField>
      </fieldset>

      <FormField label="Questions pour le rendez-vous" hint="Une question par ligne.">
        <textarea name="questions" rows={3} className={inputClass} defaultValue={initialQuestions} />
      </FormField>
      {saveError && <p role="alert" className="mb-3 text-sm text-red-800">{saveError}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="min-h-11 rounded-lg border border-gray-400 px-3 text-sm font-semibold text-gray-800">
          Annuler
        </button>
        <button type="submit" className="min-h-11 rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800">
          Enregistrer le suivi
        </button>
      </div>
    </form>
  );
}
