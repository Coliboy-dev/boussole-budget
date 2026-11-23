'use client';

import { useState, type FormEvent } from 'react';
import FormField from '@/components/forms/FormField';
import { useFormValidation } from '@/components/forms/useFormValidation';
import Card from '@/components/ui/Card';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import { isSpendingAmount } from '@/lib/budget-schema';
import { useApp } from '@/lib/context/AppContext';
import { householdCopy, householdMessages } from '@/lib/household-copy';
import { householdMovementTotals, type HouseholdTransfer } from '@/lib/household-movements';
import { isLocalDate } from '@/lib/local-date';
import { fromCents, parseAmountInput } from '@/lib/money';
import { spendingsOf } from '@/lib/spending';
import { useHouseholdMovements } from './HouseholdMovementsContext';

const action = 'min-h-11 rounded-xl border border-teal-200 px-3 text-sm font-semibold text-teal-800';
const input = 'min-h-11 w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-sm';

export default function HouseholdTransfers() {
  const household = useHouseholdMovements();
  const state = useApp();
  const [editing, setEditing] = useState<HouseholdTransfer | 'new'>();
  const [removing, setRemoving] = useState<string>();
  if (!household) return null;
  const { memberId, partnerId, transfers, memberName } = household;
  const totals = householdMovementTotals(spendingsOf(state), transfers).filter(({ advancesCents }) => advancesCents !== 0);

  return (
    <>
      <Card className="space-y-3">
        <h2 className="font-semibold">{householdCopy.transferTitle}</h2>
        {partnerId ? (
          <button type="button" className={action} onClick={() => setEditing('new')}>{householdCopy.transferCreate}</button>
        ) : <p className="text-sm text-slate-700">{householdCopy.transferPartnerNeeded}</p>}
        {editing && <TransferForm key={editing === 'new' ? 'new' : editing.hash}
          previous={editing === 'new' ? undefined : editing} close={() => setEditing(undefined)} />}
        <ul className="divide-y divide-slate-200">
          {[...transfers].reverse().map((transfer) => {
            const { transferId, fromMemberId, toMemberId, amount, date, status, answer, history } = transfer;
            const fromMe = fromMemberId === memberId;
            const statusText = status === 'confirmed' && answer
              ? householdMessages.transferConfirmedBy(memberName(answer.author))
              : status === 'not_received' ? householdCopy.transferNotReceived : householdCopy.transferAwaiting;
            return (
              <li key={transferId} className="space-y-2 py-3 text-sm">
                <p className="font-medium">{memberName(fromMemberId)} → {memberName(toMemberId)} · {formatCurrency(fromCents(amount))}</p>
                <p className="text-slate-700"><time dateTime={date}>{formatShortDate(date)}</time> · {statusText}</p>
                {history.some(({ hash }) => hash !== transfer.hash) && (
                  <details>
                    <summary className="flex min-h-11 cursor-pointer items-center font-medium">{householdCopy.transferEarlierResponse}</summary>
                    <ul className="space-y-1">
                      {history.filter(({ hash }) => hash !== transfer.hash).map(({ seq, author, status }) => (
                        <li key={seq}>{status === 'confirmed'
                          ? householdMessages.transferConfirmedBy(memberName(author)) : householdCopy.transferNotReceived}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {toMemberId === memberId && status === 'declared' && <div className="flex flex-wrap gap-2">
                  <button type="button" className={action} onClick={() => household.reply(transfer, 'confirmed')}>{householdCopy.transferConfirm}</button>
                  <button type="button" className={action} onClick={() => household.reply(transfer, 'not_received')}>{householdCopy.transferNotReceived}</button>
                </div>}
                {fromMe && <div className="flex flex-wrap gap-2">
                  {partnerId === toMemberId && <button type="button" className={action}
                    onClick={() => setEditing(transfer)}>{householdCopy.transferEdit}</button>}
                  {status !== 'confirmed' && removing !== transferId && <button type="button" className={action}
                    onClick={() => setRemoving(transferId)}>{householdCopy.transferDelete}</button>}
                </div>}
                {fromMe && status !== 'confirmed' && removing === transferId && <div className="space-y-2">
                  <p>{householdCopy.transferDeleteQuestion}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={action} onClick={() => {
                      household.remove(transfer);
                      setRemoving(undefined);
                    }}>{householdCopy.transferDelete}</button>
                    <button type="button" className={action} onClick={() => setRemoving(undefined)}>{householdCopy.cancel}</button>
                  </div>
                </div>}
              </li>
            );
          })}
        </ul>
      </Card>

      {totals.length > 0 && <Card className="space-y-3">
        <h2 className="font-semibold">{householdCopy.advances}</h2>
        <ul className="space-y-1 text-sm">
          {totals.map(({ memberId, advancesCents }) => <li key={memberId}>
            {memberName(memberId)} · {formatCurrency(fromCents(advancesCents))}
          </li>)}
        </ul>
        <p className="text-sm text-slate-700">{householdCopy.movementRecap}</p>
      </Card>}
    </>
  );
}

function TransferForm({ previous, close }: { previous?: HouseholdTransfer; close: () => void }) {
  const household = useHouseholdMovements();
  const { today } = useApp();
  const { errors, validate, clearFieldError } = useFormValidation();
  const [amount, setAmount] = useState(previous ? String(fromCents(previous.amount)) : '');
  const [date, setDate] = useState(previous?.date ?? today);
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = parseAmountInput(amount);
    if (!validate(event.currentTarget, {
      amount: isSpendingAmount(value) ? undefined : householdCopy.contributionAmountInvalid,
      date: isLocalDate(date) && date <= today ? undefined : householdCopy.contributionDateInvalid,
    })) return;
    try {
      household?.declare({ amount: value, date }, previous);
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : householdCopy.saveFailed);
    }
  }

  return (
    <form className="rounded-xl border border-slate-200 p-3" onSubmit={submit} onChange={clearFieldError} noValidate>
      <FormField label={householdCopy.transferAmount} error={errors.amount} required>
        <input name="amount" required inputMode="decimal" className={input} value={amount} onChange={(event) => setAmount(event.target.value)} />
      </FormField>
      <FormField label={householdCopy.transferDate} error={errors.date} required>
        <input name="date" type="date" required max={today} className={input} value={date} onChange={(event) => setDate(event.target.value)} />
      </FormField>
      {error && <p role="alert" className="mb-2 text-sm text-rose-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={action} type="submit">{householdCopy.save}</button>
        <button className={action} type="button" onClick={close}>{householdCopy.cancel}</button>
      </div>
    </form>
  );
}
