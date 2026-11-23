'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import FormField from '@/components/forms/FormField';
import { useFormValidation } from '@/components/forms/useFormValidation';
import Card from '@/components/ui/Card';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import { isSpendingAmount } from '@/lib/budget-schema';
import { useApp } from '@/lib/context/AppContext';
import { contributionOccurrences } from '@/lib/household-contributions';
import { householdCopy, householdMessages } from '@/lib/household-copy';
import { addDays, addMonths, isLocalDate } from '@/lib/local-date';
import { fromCents } from '@/lib/money';
import type { Frequency } from '@/lib/types';
import { useHouseholdWorkspace } from './HouseholdWorkspace';

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-teal-700';
const buttonClass = 'min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-50';
const frequencies = {
  weekly: householdCopy.weekly, monthly: householdCopy.monthly, bi_monthly: householdCopy.biMonthly,
  quarterly: householdCopy.quarterly, annual: householdCopy.annual,
} satisfies Record<Exclude<Frequency, 'one_time'>, string>;

export function HouseholdContributionEditor() {
  const { memberId } = useHouseholdWorkspace();
  const { incomes, addIncome, today, storageBlocked } = useApp();
  const own = incomes.find((income) => income.type === 'household_contribution' && income.contributionMemberId === memberId);
  const [draft, setDraft] = useState<{ amount?: string; date?: string; frequency?: Frequency }>({});
  const [expected, setExpected] = useState<typeof draft>();
  const [failure, setFailure] = useState('');
  const { errors, validate, clearFieldError } = useFormValidation();
  const amountText = draft.amount ?? own?.amount.toString() ?? '';
  const date = draft.date ?? own?.expectedDate ?? today;
  const frequency = draft.frequency ?? own?.frequency ?? 'monthly';

  if (!memberId) return null;
  const confirmed = own && expected && String(own.amount) === expected.amount
    && own.expectedDate === expected.date && own.frequency === expected.frequency;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberId) return;
    const amount = Number(amountText.replace(',', '.'));
    if (!validate(event.currentTarget, {
      amount: isSpendingAmount(amount) ? undefined : householdCopy.contributionAmountInvalid,
      date: isLocalDate(date) ? undefined : householdCopy.contributionDateInvalid,
    })) return;
    setFailure('');
    try {
      addIncome({
        amount, frequency, expectedDate: date, label: householdCopy.contribution,
        type: 'household_contribution', isConfirmed: false, contributionMemberId: memberId,
      });
      setExpected({ amount: String(amount), date, frequency });
    } catch {
      setFailure(householdCopy.contributionUnavailable);
    }
  }

  return (
    <section aria-labelledby="household-contribution">
      <Card>
        <h2 id="household-contribution" className="mb-3 font-semibold text-slate-900">{householdCopy.myContribution}</h2>
        <form onSubmit={submit} onChange={clearFieldError} noValidate>
          <FormField label={householdCopy.contributionAmount} error={errors.amount} required>
            <input name="amount" required inputMode="decimal" className={inputClass} value={amountText}
              onChange={(event) => {
                setExpected(undefined);
                setDraft({ ...draft, amount: event.target.value });
              }} />
          </FormField>
          <FormField label={householdCopy.contributionFrequency}>
            <select name="frequency" className={inputClass} value={frequency} onChange={(event) => {
              setExpected(undefined);
              setDraft({ ...draft, frequency: event.target.value as Frequency });
            }}>
              {Object.entries(frequencies).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </FormField>
          <FormField label={householdCopy.contributionDate} error={errors.date} required>
            <input name="date" type="date" required className={inputClass} value={date} onChange={(event) => {
              setExpected(undefined);
              setDraft({ ...draft, date: event.target.value });
            }} />
          </FormField>
          <button disabled={storageBlocked} className={buttonClass} type="submit">{householdCopy.save}</button>
        </form>
        {confirmed && <p role="status" className="mt-2 text-sm text-teal-800">{householdCopy.contributionSaved}</p>}
        {failure && <p role="alert" className="mt-2 text-sm text-rose-800">{failure}</p>}
      </Card>
    </section>
  );
}

export function HouseholdContributionList({ month = false }: { month?: boolean }) {
  const { memberId } = useHouseholdWorkspace();
  const { incomes, today, summary, balanceDate, storageBlocked, recordPayment } = useApp();
  const [failure, setFailure] = useState('');
  const first = `${today.slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const occurrences = contributionOccurrences(incomes, month ? first : today,
    month ? last : addDays(today, summary.availableForecast.horizon))
    .filter(({ status }) => status !== 'cancelled' && (month || status !== 'paid'));
  const title = month ? householdCopy.monthlyContributions : householdCopy.upcomingContributions;
  if (!month && !occurrences.length) return null;

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <ul className="divide-y divide-slate-200">
        {occurrences.map(({ sourceId, dueDate, amountCents, status }) => {
          const own = Boolean(memberId && incomes.find(({ id }) => id === sourceId)?.contributionMemberId === memberId);
          return (
            <li key={`${sourceId}|${dueDate}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p className="font-medium">{own ? householdCopy.ownContribution : householdCopy.otherContribution} · {formatCurrency(fromCents(amountCents))}</p>
                <p className="text-slate-700">{status === 'paid'
                  ? <><time dateTime={dueDate}>{formatShortDate(dueDate)}</time> · <span>{householdCopy.contributionReceived}</span></>
                  : householdMessages.contributionPending(dueDate)}</p>
              </div>
              {status !== 'paid' && (
                <button type="button" className={buttonClass} disabled={storageBlocked || !balanceDate} onClick={() => {
                  try {
                    recordPayment({ type: 'income', id: sourceId, dueDate, balanceIncludesPayment: false });
                    setFailure('');
                  } catch {
                    setFailure(householdCopy.paymentInvalid);
                  }
                }}>{householdCopy.recordContribution}</button>
              )}
            </li>
          );
        })}
      </ul>
      {!occurrences.length && <p className="text-sm text-slate-700">{householdCopy.noMonthlyContribution}</p>}
      {failure && <p role="alert" className="text-sm text-rose-800">{failure}</p>}
      {!month && <Link href="/foyer/mouvements" className="inline-flex min-h-11 items-center font-semibold text-teal-800 underline">
        {householdCopy.monthlyContributions}
      </Link>}
    </Card>
  );
}
