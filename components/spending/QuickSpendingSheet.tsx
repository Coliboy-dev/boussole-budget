'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { isSpendingAmount } from '@/lib/budget-schema';
import { addDays, isLocalDate } from '@/lib/local-date';
import { suggestCategory } from '@/lib/merchants';
import { amountInputValue, parseAmountInput } from '@/lib/money';
import { parseQuickEntry } from '@/lib/quick-entry';
import { labelSuggestions } from '@/lib/label-breakdown';
import { merchantCategoriesOf, selectableSpendingCategories, spendingCategoryLabels, spendingsOf, withCurrent } from '@/lib/spending';
import type { Spending, SpendingCategory } from '@/lib/types';
import FormField, { amountField, readDateInput } from '@/components/forms/FormField';
import { useFormValidation } from '@/components/forms/useFormValidation';
import Modal from '@/components/ui/Modal';
import { Icon } from '@/components/ui/icons';
import { spendingCategoryIcons } from './category-icons';
import { useHouseholdMovements } from '@/components/household/HouseholdMovementsContext';
import { householdCopy } from '@/lib/household-copy';

const inputClass = 'w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-base';
type Fields = Omit<Spending, 'id' | 'balanceRevision' | 'debited'>;

interface Props {
  initial?: Spending;
  /** Valeurs proposées pour une NOUVELLE dépense (ex. un frais d'enfant déjà encodé) ; tout reste modifiable. */
  prefill?: { amount: number; category: SpendingCategory; label?: string; date: string };
  onSave: (fields: Fields) => void;
  onClose: () => void;
}

export default function QuickSpendingSheet({ initial, prefill, onSave, onClose }: Props) {
  const state = useApp();
  const { today, balanceDate, storageBlocked, hasJointAccount } = state;
  const household = useHouseholdMovements();
  const from = addDays(today, -59);
  const counts = new Map<SpendingCategory, number>();
  for (const { date, category } of spendingsOf(state)) {
    if (category !== 'household' && date >= from && date <= today) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  // Catégorie d'une dépense modifiée toujours proposée, même si elle n'est pas (encore) au choix.
  const categories = withCurrent(selectableSpendingCategories, initial?.category === 'household' ? undefined : initial?.category);
  const ranked = [...categories].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const main = ranked.slice(0, 6);
  const more = ranked.slice(6);
  const [form, setForm] = useState({
    quickEntry: '',
    amount: amountInputValue(initial?.amount ?? prefill?.amount) ?? '',
    category: (initial?.category === 'household' ? '' : initial?.category ?? prefill?.category ?? '') as SpendingCategory | '',
    label: initial?.label ?? prefill?.label ?? '',
  });
  const [expanded, setExpanded] = useState(Boolean(initial && initial.category !== 'household' && !main.includes(initial.category))
    || Boolean(prefill && !main.includes(prefill.category)));
  const initialDate = initial?.date ?? prefill?.date ?? today;
  const [dateForBalance, setDateForBalance] = useState(initialDate);
  const [included, setIncluded] = useState<boolean>();
  const [paidPersonal, setPaidPersonal] = useState(false);
  const [saveError, setSaveError] = useState('');
  const manual = useRef({ amount: !!prefill, category: !!prefill, label: !!prefill?.label });
  const amountRef = useRef<HTMLInputElement>(null);
  const groupId = useId();
  const balanceHint = useId();
  const { errors, validate, clearFieldError, reset } = useFormValidation();
  const paidFromPersonal = !!household && (hasJointAccount === false || paidPersonal);
  const canInclude = (date: string) => !initial && !paidFromPersonal && Boolean(balanceDate && isLocalDate(date) && date <= balanceDate);
  const isIncluded = (date: string) => canInclude(date) && ((date === dateForBalance ? included : undefined)
    ?? (balanceDate !== undefined && date < balanceDate));
  const showIncluded = canInclude(dateForBalance);

  function change(field: 'amount' | 'label' | 'category', value: string) {
    manual.current[field] = true;
    setForm({ ...form, [field]: value });
  }

  function parse(text: string) {
    const entry = parseQuickEntry(text);
    const label = manual.current.label ? form.label : entry.label ?? '';
    const category = manual.current.category
      ? form.category
      : suggestCategory(label, merchantCategoriesOf(state)) ?? '';
    if (category && !main.includes(category)) setExpanded(true);
    setForm({
      ...form,
      quickEntry: text,
      label,
      category,
      amount: manual.current.amount ? form.amount : amountInputValue(entry.amount) ?? '',
    });
    reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError('');
    const amount = parseAmountInput(form.amount);
    const date = readDateInput(event.currentTarget, 'date');
    const valid = validate(event.currentTarget, {
      amount: isSpendingAmount(amount) ? undefined : 'Saisis un montant d’au moins 0,01 € avec deux décimales au maximum.',
      category: form.category ? undefined : 'Choisis une catégorie.',
      date: isLocalDate(date) && date <= today ? undefined : 'Choisis une date égale ou antérieure à aujourd’hui.',
    });
    if (!valid || !form.category || storageBlocked) return;

    try {
      onSave({ amount, category: form.category, date, label: form.label.trim() || undefined, balanceIncluded: isIncluded(date),
        ...(paidFromPersonal && { paidFrom: 'personal' }) });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Impossible d’enregistrer cette dépense.');
    }
  }

  function categoryOptions(list: SpendingCategory[]) {
    return list.map((category) => (
      <label key={category} className={`flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-2 py-1.5 text-xs font-medium
        ${form.category === category ? 'border-teal-700 bg-teal-50 text-teal-950' : 'border-gray-300 text-gray-800'}`}>
        <input
          type="radio" name="category" value={category} required
          checked={form.category === category} onChange={() => change('category', category)}
          className="size-4 shrink-0 accent-teal-700"
        />
        <Icon icon={spendingCategoryIcons[category]} className="size-4 shrink-0 text-teal-800" />
        <span className="wrap-anywhere">{spendingCategoryLabels[category]}</span>
      </label>
    ));
  }

  return (
    <Modal title={initial ? 'Modifier la dépense' : 'Nouvelle dépense'} onClose={onClose} initialFocusRef={amountRef}>
      <form onSubmit={submit} onChange={clearFieldError} noValidate>
        {!initial && (
          <FormField label="Saisie rapide" hint="Écris ou dicte : 42,28 Colruyt">
            <input name="quickEntry" className={inputClass} autoComplete="off"
              value={form.quickEntry} onChange={(event) => parse(event.target.value)} />
          </FormField>
        )}
        <FormField label="Montant (€)" required error={errors.amount}>
          <input ref={amountRef} name="amount" {...amountField}
            className={inputClass} required value={form.amount} onChange={(event) => change('amount', event.target.value)} />
        </FormField>
        <div className="mb-4">
          <p id={groupId} className="mb-2 text-sm font-semibold text-gray-700">Catégorie</p>
          <div role="radiogroup" aria-labelledby={groupId} aria-required="true"
            aria-describedby={errors.category ? `${groupId}-error` : undefined}>
            <div className="grid grid-cols-2 gap-2">{categoryOptions(main)}</div>
            {expanded && <div id={`${groupId}-extra`} className="mt-2 grid grid-cols-2 gap-2">{categoryOptions(more)}</div>}
          </div>
          <button type="button" aria-expanded={expanded} aria-controls={expanded ? `${groupId}-extra` : undefined}
            className="min-h-11 text-sm font-semibold text-teal-800 underline" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Moins de catégories' : 'Autres catégories'}
          </button>
          {errors.category && <p id={`${groupId}-error`} role="alert" className="text-xs text-red-700">{errors.category}</p>}
        </div>
        <FormField label="Commerce ou note">
          {/* Reprendre le même libellé (« Café ») permet de voir ce qu'il coûte sur le mois, dans Où part mon argent. */}
          <input name="label" className={inputClass} value={form.label} list={`${groupId}-libelles`} autoComplete="off"
            onChange={(event) => change('label', event.target.value)} />
        </FormField>
        <datalist id={`${groupId}-libelles`}>
          {labelSuggestions(state, form.category, today).map((label) => <option key={label} value={label} />)}
        </datalist>
        <FormField label="Date" required error={errors.date}>
          <input name="date" type="date" max={today} className={inputClass} required
            defaultValue={initialDate} onChange={(event) => {
              setDateForBalance(event.target.value);
              setIncluded(undefined);
            }} />
        </FormField>
        {!initial && household && (
          <label className="mb-4 flex min-h-11 items-center gap-2 text-sm font-medium text-slate-800">
            <input type="checkbox" className="size-5 accent-teal-700" checked={paidFromPersonal}
              disabled={hasJointAccount === false} onChange={(event) => setPaidPersonal(event.target.checked)} />
            {householdCopy.paidWithPersonal}
          </label>
        )}
        {showIncluded && (
          <div className="mb-3">
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-gray-800">
              <input type="checkbox" className="size-5 shrink-0 accent-teal-700" aria-describedby={balanceHint}
                checked={isIncluded(dateForBalance)} onChange={(event) => setIncluded(event.target.checked)} />
              Déjà comprise dans mon solde
            </label>
            <p id={balanceHint} className="text-xs text-gray-600">Coche si ton solde a été recopié de ta banque après cet achat.</p>
          </div>
        )}
        {saveError && <p role="alert" className="mb-3 text-sm text-red-800">{saveError}</p>}
        <button type="submit" disabled={storageBlocked}
          className="min-h-11 w-full rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
          {initial ? 'Enregistrer' : 'Ajouter la dépense'}
        </button>
      </form>
    </Modal>
  );
}
