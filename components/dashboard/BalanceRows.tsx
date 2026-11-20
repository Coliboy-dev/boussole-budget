'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Landmark, Pencil, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useFormValidation } from '@/components/forms/useFormValidation';
import { Icon } from '@/components/ui/icons';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import { isBudgetAmount } from '@/lib/budget-schema';
import { balanceFreshness, passedOccurrences, type PassedOccurrence } from '@/lib/balance-update';
import { useApp } from '@/lib/context/AppContext';
import { fromCents } from '@/lib/money';

const keyOf = (item: PassedOccurrence) => `${item.type}:${item.id}:${item.dueDate}`;

function ageLabel(days: number) {
  if (days <= 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  return `il y a ${days} jours`;
}

/** Solde et réserve : les deux réglages qui déterminent directement le vrai disponible. */
export default function BalanceRows() {
  const app = useApp();
  const { currentBalance, setBalance, balanceDate, userProfile, today } = app;
  const [step, setStep] = useState<'view' | 'amount' | 'passed'>('view');
  const [input, setInput] = useState('');
  const [amount, setAmount] = useState(0);
  const [passed, setPassed] = useState<PassedOccurrence[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState('');
  const validation = useFormValidation();
  const freshness = balanceFreshness(app, today);

  function startEdit() {
    validation.reset();
    setFeedback('');
    setInput(currentBalance.toString());
    setStep('amount');
  }

  function save(value: number, settled: PassedOccurrence[]) {
    setBalance(value, settled.map(({ type, id, dueDate }) => ({ type, id, dueDate })));
    setStep('view');
    setFeedback(settled.length === 0
      ? 'Solde mis à jour.'
      : `Solde mis à jour. ${settled.length} ${settled.length === 1 ? 'échéance marquée comme passée' : 'échéances marquées comme passées'}.`);
  }

  function submitAmount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = parseFloat(input.replace(',', '.'));
    if (!validation.validate(event.currentTarget, {
      balance: isBudgetAmount(value) ? undefined : 'Saisis un montant de solde valide.',
    })) return;
    const candidates = passedOccurrences(app, today);
    if (candidates.length === 0) {
      save(value, []);
      return;
    }
    setAmount(value);
    setPassed(candidates);
    setChecked(new Set(candidates.filter((item) => item.sinceLastBalance).map(keyOf)));
    setStep('passed');
  }

  function toggle(key: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="divide-y divide-slate-200/70">
      <div className="px-4 py-2">
        {step === 'amount' && (
          <form onSubmit={submitAmount} onChange={validation.clearFieldError} noValidate className="py-1">
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
                onClick={() => setStep('view')}
                className="flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                <Icon icon={X} className="size-5" />
              </button>
            </div>
          </form>
        )}

        {step === 'passed' && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save(amount, passed.filter((item) => checked.has(keyOf(item))));
            }}
            className="space-y-3 py-1"
          >
            <fieldset>
              <legend className="text-sm font-semibold text-slate-900">
                Qu’est-ce qui est déjà passé sur ton compte ?
              </legend>
              <p className="mt-1 text-xs text-slate-600">
                Coche ce que ton solde de {formatCurrency(amount)} contient déjà. Ces montants ne seront pas déduits une seconde fois.
                Ce qui n’est pas coché reste à payer.
              </p>
              <ul className="mt-2 divide-y divide-slate-200/70 rounded-xl border border-slate-200 bg-white">
                {passed.map((item) => {
                  const key = keyOf(item);
                  const id = `passed-${key.replace(/[^a-zA-Z0-9-]/g, '-')}`;
                  return (
                    <li key={key}>
                      <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                        <input
                          id={id}
                          type="checkbox"
                          checked={checked.has(key)}
                          onChange={() => toggle(key)}
                          className="size-5 shrink-0 accent-teal-700"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-900">{item.label}</span>
                          <span className="block text-xs text-slate-600">
                            Prévu le <time dateTime={item.dueDate}>{formatShortDate(item.dueDate)}</time>
                          </span>
                        </span>
                        <span className={`shrink-0 text-sm font-semibold tabular-nums ${item.amountCents > 0 ? 'text-green-800' : 'text-slate-900'}`}>
                          {item.amountCents > 0 ? '+' : ''}{formatCurrency(fromCents(item.amountCents))}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="rounded-xl bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">
                Enregistrer le solde
              </button>
              <button
                type="button"
                onClick={() => setStep('amount')}
                className="rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800"
              >
                Retour
              </button>
            </div>
          </form>
        )}

        {step === 'view' && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon icon={Landmark} className="size-5 shrink-0 text-teal-700" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Solde bancaire</p>
                <p className="text-xs text-slate-600">
                  {balanceDate
                    ? <>Au <time dateTime={balanceDate}>{formatShortDate(balanceDate)}</time></>
                    : 'À mettre à jour depuis ton compte'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(currentBalance)}</span>
              <button
                type="button"
                onClick={startEdit}
                aria-label={freshness.stale ? 'Mettre à jour le solde bancaire' : 'Modifier le solde bancaire'}
                className={freshness.stale
                  ? 'inline-flex items-center gap-1 rounded-xl bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800'
                  : 'inline-flex items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-800 hover:bg-teal-100'}
              >
                <Icon icon={freshness.stale ? RefreshCw : Pencil} className="size-3.5" />
                {freshness.stale ? 'Mettre à jour' : 'Modifier'}
              </button>
            </div>
          </div>
        )}
        {step === 'view' && freshness.stale && freshness.days !== null && (
          <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900">
            Saisi {ageLabel(freshness.days)}
            {freshness.passedSince > 0 && (
              <> · {freshness.passedSince} {freshness.passedSince === 1 ? 'échéance est passée' : 'échéances sont passées'} depuis</>
            )}
            . Recopie le solde de ta banque pour un disponible juste.
          </p>
        )}
        {step === 'view' && feedback && <p role="status" className="mt-1 text-xs text-green-800">{feedback}</p>}
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
