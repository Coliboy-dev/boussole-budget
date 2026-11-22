'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import SummaryCard from '@/components/dashboard/SummaryCard';
import { accountSignupEnabled, useCloudSync } from '@/components/sync/CloudSyncProvider';
import FormField from '@/components/forms/FormField';
import { useFormValidation } from '@/components/forms/useFormValidation';
import Card from '@/components/ui/Card';
import { formatShortDate } from '@/lib/budget-calculations';
import { isBudgetAmount } from '@/lib/budget-schema';
import { useApp } from '@/lib/context/AppContext';
import { addDays, isLocalDate } from '@/lib/local-date';
import { parseAmountInput } from '@/lib/money';
import { isPositiveOnboardingAmount, type FirstBudgetInput } from '@/lib/onboarding';
import { AVAILABLE_HORIZON } from '@/lib/projection';

type Step = 1 | 2 | 3;
type BillDraft = { id: number; label: string; amount: string; date: string };
type BillField = 'label' | 'amount' | 'date';

const questions: Record<Step, string> = {
  1: 'Quel est ton solde aujourd’hui ?',
  2: 'Quand arrive ta prochaine rentrée d’argent ?',
  3: 'Quelles factures dois-tu encore payer ?',
};
const inputClass = 'min-w-0 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700';
const primaryClass = 'w-full rounded-xl bg-teal-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-teal-800';
const secondaryClass = 'rounded-xl px-3 py-2.5 text-sm font-medium text-teal-800 hover:bg-teal-50';
const positiveAmountError = 'Saisis un montant supérieur à zéro avec deux décimales au maximum.';

function billName(id: number, field: BillField): string {
  return `bill-${id}-${field}`;
}

export default function BudgetOnboarding({ onComplete, onFinish, onCancel }: {
  onComplete?: () => void;
  onFinish?: (input: FirstBudgetInput) => Promise<void>;
  onCancel?: () => Promise<void>;
}) {
  const { today, finishOnboarding } = useApp();
  const [step, setStep] = useState<Step>(1);
  const [balance, setBalance] = useState('');
  const [income, setIncome] = useState({ date: '', amount: '' });
  const [bills, setBills] = useState<BillDraft[]>([]);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const nextBill = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const { errors, validate, clearFieldError, reset } = useFormValidation();

  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  function changeStep(next: Step) {
    reset();
    setSaveError('');
    setStep(next);
  }

  function addBill() {
    const id = nextBill.current++;
    setBills((current) => [...current, { id, label: '', amount: '', date: '' }]);
  }

  function updateBill(id: number, field: BillField, value: string) {
    setBills((current) => current.map((bill) => bill.id === id ? { ...bill, [field]: value } : bill));
  }

  async function finish(input?: FirstBudgetInput) {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      if (onFinish && input) await onFinish(input);
      else finishOnboarding(input);
      if (input) onComplete?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Impossible d’enregistrer ton budget.');
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (step === 1) {
      const validBalance = isBudgetAmount(parseAmountInput(balance));
      if (validate(form, { balance: validBalance ? undefined : 'Saisis un solde valide avec deux décimales au maximum.' })) {
        changeStep(2);
      }
      return;
    }

    if (step === 2) {
      if (validate(form, {
        incomeDate: isLocalDate(income.date) && income.date >= today ? undefined : 'Choisis une date à partir d’aujourd’hui.',
        incomeAmount: isPositiveOnboardingAmount(parseAmountInput(income.amount)) ? undefined : positiveAmountError,
      })) changeStep(3);
      return;
    }

    const rules: Record<string, string | undefined> = {};
    const entries = bills.map(({ id, label, amount: text, date }) => {
      const amount = parseAmountInput(text);
      if (!label.trim()) rules[billName(id, 'label')] = 'Renseigne le nom de la facture.';
      if (!isPositiveOnboardingAmount(amount)) rules[billName(id, 'amount')] = positiveAmountError;
      if (!isLocalDate(date)) rules[billName(id, 'date')] = 'Renseigne une date d’échéance valide.';
      return { label, amount, date };
    });
    if (!validate(form, rules)) return;

    void finish({
      balance: parseAmountInput(balance),
      income: income.date ? { date: income.date, amount: parseAmountInput(income.amount) } : undefined,
      bills: entries,
    });
  }

  const action = step === 3
    ? bills.length ? 'Calculer mon disponible' : 'Calculer sans ajouter de facture'
    : 'Continuer';
  const incomeWithinHorizon = income.date && income.date <= addDays(today, AVAILABLE_HORIZON);

  return (
    <div className="space-y-4 px-4 py-4 sm:py-8">
      <Card className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-teal-800">Étape {step} sur 3</p>
          <h1 ref={heading} tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">
            {questions[step]}
          </h1>
          {step === 2 && <p className="text-sm text-gray-600">Indique le prochain versement certain encore attendu.</p>}
          {step === 3 && (
            <p className="text-sm text-gray-600">
              {incomeWithinHorizon
                ? `Ajoute celles qui tombent d’ici ton versement du ${formatShortDate(income.date)}.`
                : `Ajoute les factures prévues dans les ${AVAILABLE_HORIZON} prochains jours.`}
            </p>
          )}
        </div>

        <form key={step} onSubmit={submit} onChange={clearFieldError} noValidate>
          {step === 1 && (
            <FormField required label="Solde bancaire (€)" error={errors.balance} hint="Indique un signe moins si ton compte est à découvert.">
              <input name="balance" required type="text" placeholder="0,00" className={inputClass}
                value={balance} onChange={(event) => setBalance(event.target.value)} />
            </FormField>
          )}
          {step === 2 && (
            <div className="grid gap-x-4 sm:grid-cols-2">
              <FormField required label="Date du prochain versement" error={errors.incomeDate}>
                <input name="incomeDate" required type="date" className={inputClass}
                  value={income.date} onChange={(event) => setIncome({ ...income, date: event.target.value })} />
              </FormField>
              <FormField required label="Montant attendu (€)" error={errors.incomeAmount}>
                <input name="incomeAmount" required type="text" inputMode="decimal" placeholder="0,00" className={inputClass}
                  value={income.amount} onChange={(event) => setIncome({ ...income, amount: event.target.value })} />
              </FormField>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3 pb-4">
              {bills.map((bill, index) => (
                <fieldset key={bill.id} className="min-w-0 rounded-xl border border-gray-200 px-3">
                  <legend className="px-1 text-sm font-semibold text-gray-700">Facture {index + 1}</legend>
                  <FormField required label="Nom de la facture" error={errors[billName(bill.id, 'label')]}>
                    <input autoFocus={index === bills.length - 1} name={billName(bill.id, 'label')} required type="text"
                      className={inputClass} value={bill.label} onChange={(event) => updateBill(bill.id, 'label', event.target.value)} />
                  </FormField>
                  <div className="grid grid-cols-2 gap-x-3">
                    <FormField required label="Montant (€)" error={errors[billName(bill.id, 'amount')]}>
                      <input name={billName(bill.id, 'amount')} required type="text" inputMode="decimal" className={inputClass}
                        value={bill.amount} onChange={(event) => updateBill(bill.id, 'amount', event.target.value)} />
                    </FormField>
                    <FormField required label="Échéance" error={errors[billName(bill.id, 'date')]}>
                      <input name={billName(bill.id, 'date')} required type="date" className={inputClass}
                        value={bill.date} onChange={(event) => updateBill(bill.id, 'date', event.target.value)} />
                    </FormField>
                  </div>
                  <button type="button" className="mb-2 rounded-lg py-2 text-sm font-medium text-gray-700 underline"
                    aria-label={`Retirer la facture ${index + 1}`}
                    onClick={() => setBills((current) => current.filter(({ id }) => id !== bill.id))}>
                    Retirer
                  </button>
                </fieldset>
              ))}
              <button type="button" className={secondaryClass} onClick={addBill}>Ajouter une facture</button>
            </div>
          )}

          {saveError && <p role="alert" className="mb-3 text-sm text-red-700">{saveError}</p>}

          <div className="space-y-2">
            <button type="submit" disabled={saving} className={primaryClass}>{saving ? 'Enregistrement…' : action}</button>
            {step > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" className={secondaryClass} onClick={() => changeStep(step === 3 ? 2 : 1)}>Retour</button>
                {step === 2 && (
                  <button type="button" className={secondaryClass} onClick={() => {
                    setIncome({ date: '', amount: '' });
                    changeStep(3);
                  }}>
                    Pas de rentrée confirmée
                  </button>
                )}
              </div>
            )}
          </div>
        </form>
      </Card>

      {onCancel ? (
        <button type="button" disabled={saving} className={secondaryClass} onClick={() => void onCancel()}>Annuler et me déconnecter</button>
      ) : step === 1 && (
        <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-medium text-teal-800">
          <Link href="/sauvegarde" className="inline-flex min-h-11 items-center underline">Restaurer une sauvegarde</Link>
          <Link href="/demo" prefetch={false} className="inline-flex min-h-11 items-center underline">Voir la démo</Link>
          <button type="button" className="underline" onClick={() => void finish()}>Passer pour l’instant</button>
        </div>
      )}
    </div>
  );
}

export function OnboardingResult({ onContinue, onlineCopy = false }: { onContinue: () => void; onlineCopy?: boolean }) {
  const { summary, balanceDate } = useApp();
  const { phase, beginSignIn } = useCloudSync();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className="space-y-4 px-4 py-4 sm:py-8">
      <h1 ref={heading} tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">
        Ton premier budget
      </h1>
      {onlineCopy && <p role="status" className="text-sm font-semibold text-teal-800">Copie en ligne créée.</p>}
      <SummaryCard summary={summary} hasUndatedPayments={false} hasRecordedBalance={Boolean(balanceDate)} />
      <p className="text-sm text-gray-600">
        Ce premier calcul utilise les échéances que tu as saisies. Tu peux compléter ton budget ensuite.
      </p>
      <button type="button" className={primaryClass} onClick={onContinue}>Voir mon tableau de bord</button>
      <p className="text-sm text-gray-700">
        Tu veux empêcher une autre personne de voir ton budget sur ce téléphone ?{' '}
        <Link href="/synchronisation#verrouillage" className="font-semibold text-teal-800 underline">Verrouiller Boussole avec un code</Link>
      </p>
      {accountSignupEnabled && phase === 'signed-out' && !onlineCopy && (
        <Link href="/synchronisation" onClick={() => beginSignIn(true)}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline">
          Sauvegarder en ligne
        </Link>
      )}
    </div>
  );
}
