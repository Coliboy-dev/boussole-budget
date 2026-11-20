'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import FormField from '@/components/forms/FormField';
import { useFormValidation } from '@/components/forms/useFormValidation';
import Card from '@/components/ui/Card';
import { formatCurrency, formatDate, hasUndatedPayments } from '@/lib/budget-calculations';
import { isNonNegativeBudgetAmount } from '@/lib/budget-schema';
import { useApp } from '@/lib/context/AppContext';
import { isLocalDate } from '@/lib/local-date';
import { parseAmountInput } from '@/lib/money';
import { simulatePurchase } from '@/lib/purchase-simulation';

const fieldClass = 'w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-base';

export default function SimulationPage() {
  const { summary, balanceDate, expenses, debts, today, isBudgetLoading } = useApp();
  const [purchase, setPurchase] = useState<{ amount: number; date: string }>();
  const { errors, validate, clearFieldError } = useFormValidation();
  const forecast = summary.availableForecast;
  const through = forecast.dailyBalances.at(-1)?.date ?? today;
  const result = purchase && simulatePurchase(forecast, purchase.amount, purchase.date);
  const hasBudget = Boolean(balanceDate) || !summary.emptyBudget;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = parseAmountInput(String(data.get('amount') ?? ''));
    const date = String(data.get('date') ?? '');
    const valid = validate(event.currentTarget, {
      amount: isNonNegativeBudgetAmount(amount) && amount > 0 ? undefined : 'Saisis un montant supérieur à zéro, avec deux décimales au maximum.',
      date: isLocalDate(date) && date >= today && date <= through ? undefined : 'Choisis une date dans la période affichée.',
    });
    setPurchase(valid ? { amount, date } : undefined);
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-slate-900">Puis-je me permettre cet achat ?</h1>
      {isBudgetLoading ? (
        <p role="status" className="text-sm text-slate-600">Chargement du budget…</p>
      ) : !hasBudget ? (
        <Card>
          <p className="text-sm text-slate-700">Saisis ton solde et tes échéances pour simuler un achat.</p>
          <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline">
            Ouvrir Aujourd’hui
          </Link>
        </Card>
      ) : (
        <>
          <Card>
            <form onSubmit={submit} onChange={(event) => {
              clearFieldError(event);
              setPurchase(undefined);
            }} noValidate>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <FormField label="Montant de l’achat (€)" required error={errors.amount}>
                  <input name="amount" type="text" inputMode="decimal" className={fieldClass} placeholder="0,00" required />
                </FormField>
                <FormField label="Date de l’achat" required hint={`Jusqu’au ${formatDate(through)}`} error={errors.date}>
                  <input name="date" type="date" min={today} max={through} defaultValue={today} className={fieldClass} required />
                </FormField>
              </div>
              <button type="submit" className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
                Simuler l’achat
              </button>
            </form>
          </Card>
          <div aria-live="polite" aria-atomic="true">
            {result && (
              <section aria-labelledby="simulation-result" className={`rounded-2xl border p-4 ${result.affordable
                ? 'border-teal-200 bg-teal-50 text-teal-950'
                : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
                <h2 id="simulation-result" className="text-lg font-bold">
                  {result.affordable ? 'Oui, l’achat tient dans ton budget.' : 'Non, cet achat dépasse ta marge.'}
                </h2>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-sm">Nouveau point bas</dt>
                    <dd className="wrap-anywhere text-xl font-bold tabular-nums">{formatCurrency(result.lowestBalance)}</dd>
                    <dd className="text-xs"><time dateTime={result.lowestDate}>{formatDate(result.lowestDate)}</time></dd>
                  </div>
                  <div>
                    <dt className="text-sm">{forecast.annualProvision > 0 ? 'Marge après réserve et provisions' : 'Marge après réserve'}</dt>
                    <dd className="wrap-anywhere text-xl font-bold tabular-nums">{formatCurrency(result.available)}</dd>
                  </div>
                </dl>
                {hasUndatedPayments(expenses, debts) && (
                  <p className="mt-3 text-sm text-slate-700">
                    Projection partielle. Renseigne les dates des charges et mensualités pour les inclure.
                  </p>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
