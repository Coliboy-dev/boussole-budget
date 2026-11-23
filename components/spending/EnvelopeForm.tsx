'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { calculateBudgetSummary, formatCurrency } from '@/lib/budget-calculations';
import { isNonNegativeBudgetAmount } from '@/lib/budget-schema';
import { parseAmountInput } from '@/lib/money';
import { envelopesOf, replaceExpenseWithEnvelope, selectableSpendingCategories, spendingCategoryLabels, spendingsOf, withCurrent } from '@/lib/spending';
import type { Envelope, SpendingCategory } from '@/lib/types';
import FormField from '@/components/forms/FormField';
import { useFormValidation } from '@/components/forms/useFormValidation';
import Modal from '@/components/ui/Modal';

const inputClass = 'w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-base';

export default function EnvelopeForm({ initial, prefill, onClose }: {
  initial?: Envelope;
  prefill?: { category: SpendingCategory; monthlyAmount?: number };
  onClose: () => void;
}) {
  const state = useApp();
  const used = envelopesOf(state);
  const choices = initial ? [initial.category] : withCurrent(selectableSpendingCategories, prefill?.category).filter(
    (category) => !used.some((envelope) => envelope.category === category),
  );
  const firstCategory = initial?.category ?? prefill?.category;
  const firstAmount = initial?.monthlyAmount ?? prefill?.monthlyAmount;
  const [category, setCategory] = useState<SpendingCategory | ''>(firstCategory ?? '');
  const [label, setLabel] = useState(initial?.label ?? (firstCategory ? spendingCategoryLabels[firstCategory] : ''));
  const [amount, setAmount] = useState(firstAmount?.toString() ?? '');
  const [replaceId, setReplaceId] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  const { errors, validate, clearFieldError } = useFormValidation();
  const expense = state.expenses.find(
    (item) => item.category === category && item.isRecurring && item.frequency !== 'one_time',
  );
  const monthlyAmount = parseAmountInput(amount);
  const preview = replaceId && expense?.id === replaceId && category
    ? replaceExpenseWithEnvelope(state, replaceId, category, monthlyAmount)
    : state;
  const replacement = preview !== state ? calculateBudgetSummary(
    preview.currentBalance, preview.incomes, preview.expenses, preview.debts,
    preview.childExpenses, preview.userProfile.safetyReserve, preview.goals, state.today,
    { envelopes: envelopesOf(preview), spendings: spendingsOf(preview) },
  ) : undefined;

  function valid(form: HTMLFormElement) {
    return validate(form, {
      category: category && choices.includes(category) ? undefined : 'Choisis une catégorie sans enveloppe.',
      label: label.trim() ? undefined : 'Renseigne le libellé de l’enveloppe.',
      amount: isNonNegativeBudgetAmount(monthlyAmount) ? undefined : 'Saisis un montant positif ou nul, avec deux décimales au maximum.',
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid(event.currentTarget) || !category || !choices.includes(category) || state.storageBlocked) return;
    const envelope = { id: initial?.id, category, label: label.trim(), monthlyAmount };
    if (replaceId) {
      if (!replacement) return;
      state.replaceExpenseWithEnvelope(replaceId, envelope);
    } else {
      state.saveEnvelope(envelope);
    }
    onClose();
  }

  return (
    <Modal title={initial ? 'Modifier l’enveloppe' : 'Créer une enveloppe'} onClose={onClose}>
      <form ref={formRef} onSubmit={submit} onChange={clearFieldError} noValidate>
        <FormField label="Catégorie" required error={errors.category}>
          <select name="category" className={inputClass} required value={category} onChange={(event) => {
            const selected = choices.find((choice) => choice === event.target.value) ?? '';
            setCategory(selected);
            setLabel(selected ? spendingCategoryLabels[selected] : '');
            setReplaceId(undefined);
          }}>
            {!initial && <option value="">Choisis une catégorie</option>}
            {choices.map((choice) => <option key={choice} value={choice}>{spendingCategoryLabels[choice]}</option>)}
          </select>
        </FormField>
        <FormField label="Libellé" required error={errors.label}>
          <input name="label" className={inputClass} required value={label} onChange={(event) => {
            setLabel(event.target.value);
            setReplaceId(undefined);
          }} />
        </FormField>
        <FormField label="Montant mensuel (€)" required error={errors.amount}
          hint={prefill && prefill.monthlyAmount === undefined ? 'Indique ce que tu veux réserver chaque mois.' : undefined}>
          <input name="amount" type="number" inputMode="decimal" min="0" step="0.01" className={inputClass}
            required value={amount} onChange={(event) => { setAmount(event.target.value); setReplaceId(undefined); }} />
        </FormField>
        {expense && (
          <div className="mb-4 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p>Si tu gardes la charge « {expense.label} », Capiste comptera la charge et l’enveloppe dans ton budget.</p>
            {replacement ? (
              <>
                <p>{category === 'groceries'
                  ? 'Avec une enveloppe, Capiste met de côté tes courses du mois prochain dès le 1ᵉʳ.'
                  : 'Avec une enveloppe, Capiste met de côté le montant du mois prochain dès le 1ᵉʳ.'}</p>
                <dl className="space-y-1">
                  <div className="flex flex-wrap justify-between gap-x-3"><dt>Vrai disponible actuel</dt>
                    <dd className="font-bold">{formatCurrency(state.summary.trueAvailable)}</dd></div>
                  <div className="flex flex-wrap justify-between gap-x-3"><dt>Vrai disponible après remplacement</dt>
                    <dd className="font-bold">{formatCurrency(replacement.trueAvailable)}</dd></div>
                </dl>
                <button type="button" className="min-h-11 underline" onClick={() => setReplaceId(undefined)}>
                  Annuler le remplacement
                </button>
              </>
            ) : (
              <button type="button" disabled={state.storageBlocked}
                className="min-h-11 text-left font-semibold underline disabled:opacity-50"
                onClick={() => { if (formRef.current && valid(formRef.current)) setReplaceId(expense.id); }}>
                Remplacer la charge par cette enveloppe
              </button>
            )}
          </div>
        )}
        <button type="submit" disabled={state.storageBlocked || (Boolean(replaceId) && !replacement)}
          className="min-h-11 w-full rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
          {replacement ? 'Confirmer le remplacement' : initial ? 'Enregistrer' : 'Créer l’enveloppe'}
        </button>
      </form>
    </Modal>
  );
}
