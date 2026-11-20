'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Landmark, Pencil, ShieldCheck, X } from 'lucide-react';
import { useFormValidation } from '@/components/forms/useFormValidation';
import { Icon } from '@/components/ui/icons';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import { isBudgetAmount } from '@/lib/budget-schema';
import { useApp } from '@/lib/context/AppContext';

/** Solde et réserve : les deux réglages qui déterminent directement le vrai disponible. */
export default function BalanceRows() {
  const { currentBalance, setBalance, balanceDate, userProfile } = useApp();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const validation = useFormValidation();

  function startEdit() {
    validation.reset();
    setInput(currentBalance.toString());
    setEditing(true);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = parseFloat(input.replace(',', '.'));
    if (!validation.validate(event.currentTarget, {
      balance: isBudgetAmount(value) ? undefined : 'Saisis un montant de solde valide.',
    })) return;
    setBalance(value);
    setEditing(false);
  }

  return (
    <div className="divide-y divide-slate-200/70">
      <div className="px-4 py-2">
        {editing ? (
          <form onSubmit={submit} onChange={validation.clearFieldError} noValidate className="py-1">
            <label htmlFor="bank-balance" className="text-sm font-semibold text-slate-900">Solde bancaire actuel</label>
            <div className="mt-1.5 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <input
                  id="bank-balance"
                  autoFocus
                  name="balance"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  required
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  aria-invalid={validation.errors.balance ? true : undefined}
                  aria-describedby={validation.errors.balance ? 'bank-balance-error' : 'bank-balance-hint'}
                  placeholder="0,00"
                  className="w-full rounded-xl border border-teal-300 bg-white px-3 py-2 text-lg font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
                {validation.errors.balance ? (
                  <p id="bank-balance-error" role="alert" className="mt-1 text-xs text-red-700">{validation.errors.balance}</p>
                ) : (
                  <p id="bank-balance-hint" className="mt-1 text-xs text-slate-600">Le montant affiché par ta banque aujourd’hui.</p>
                )}
              </div>
              <button type="submit" className="rounded-xl bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">
                OK
              </button>
              <button
                type="button"
                aria-label="Annuler la modification du solde"
                onClick={() => setEditing(false)}
                className="flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                <Icon icon={X} className="size-5" />
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon icon={Landmark} className="size-5 shrink-0 text-teal-700" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Solde bancaire</p>
                <p className="text-xs text-slate-600">
                  {balanceDate ? <>Au <time dateTime={balanceDate}>{formatShortDate(balanceDate)}</time></> : 'À mettre à jour depuis ton compte'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(currentBalance)}</span>
              <button
                type="button"
                onClick={startEdit}
                aria-label="Modifier le solde bancaire"
                className="inline-flex items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-800 hover:bg-teal-100"
              >
                <Icon icon={Pencil} className="size-3.5" />
                Modifier
              </button>
            </div>
          </div>
        )}
      </div>
      <Link
        href="/reglages#reserve"
        className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 hover:bg-white/70"
      >
        <span className="flex items-center gap-2.5 text-sm font-medium text-slate-900">
          <Icon icon={ShieldCheck} className="size-5 text-teal-700" />
          Réserve de sécurité
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-slate-900">
          {formatCurrency(userProfile.safetyReserve)}
          <Icon icon={ChevronRight} className="size-4 text-slate-500" />
        </span>
      </Link>
    </div>
  );
}
