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
import { amountInputValue, fromCents, parseBalanceInput } from '@/lib/money';
import { amountField, OverdrawnCheckbox } from '@/components/forms/FormField';
import { useHouseholdWorkspace } from '@/components/household/HouseholdWorkspace';

const keyOf = (item: PassedOccurrence) => `${item.type}:${item.id}:${item.dueDate}`;

function ageLabel(days: number) {
  if (days <= 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  return `il y a ${days} jours`;
}

/** Solde et réserve : les deux réglages qui déterminent directement le vrai disponible. */
export default function BalanceRows() {
  const app = useApp();
  const { active: household } = useHouseholdWorkspace();
  const { currentBalance, setBalance, reloadStoredBudget, balanceDate, userProfile, today } = app;
  const [step, setStep] = useState<'view' | 'amount' | 'passed'>('view');
  const [input, setInput] = useState('');
  const [overdrawn, setOverdrawn] = useState(false);
  const [amount, setAmount] = useState(0);
  const [passed, setPassed] = useState<PassedOccurrence[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const validation = useFormValidation();
  const freshness = balanceFreshness(app, today);

  function startEdit() {
    validation.reset();
    setFeedback('');
    setSaveError('');
    setInput(amountInputValue(Math.abs(currentBalance)) ?? '');
    setOverdrawn(currentBalance < 0);
    setStep('amount');
  }

  async function save(value: number, settled: PassedOccurrence[]) {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await setBalance(value, settled.map(({ type, id, dueDate }) => ({ type, id, dueDate })));
      setStep('view');
      setFeedback(settled.length === 0
        ? 'Solde mis à jour.'
        : `Solde mis à jour. ${settled.length} ${settled.length === 1 ? 'échéance marquée comme passée' : 'échéances marquées comme passées'}.`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Impossible d’enregistrer ton solde.');
    } finally {
      setSaving(false);
    }
  }

  function resumeAfterReload() {
    reloadStoredBudget();
    validation.reset();
    setSaveError('');
    setStep('amount');
  }

  function submitAmount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = parseBalanceInput(input, overdrawn);
    if (!validation.validate(event.currentTarget, {
      balance: isBudgetAmount(value) ? undefined : 'Encode un montant de solde valide.',
    })) return;
    const candidates = passedOccurrences(app, today);
    if (candidates.length === 0) {
      void save(value, []);
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
    <div className="divide-y divide-cap-border">
      <div className="px-4 py-2">
        {step === 'amount' && (
          <form onSubmit={submitAmount} onChange={validation.clearFieldError} noValidate className="py-1">
            <label htmlFor="bank-balance" className="text-sm font-semibold text-cap-text">Solde bancaire actuel</label>
            <div className="mt-1.5 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <input
                  id="bank-balance"
                  autoFocus
                  name="balance"
                  {...amountField}
                  required
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  aria-invalid={validation.errors.balance ? true : undefined}
                  aria-describedby={validation.errors.balance ? 'bank-balance-error' : 'bank-balance-hint'}
                  placeholder="0,00"
                  className="w-full rounded-xl border border-cap-border-strong bg-white px-3 py-2 text-lg font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-cap-focus"
                />
                {validation.errors.balance ? (
                  <p id="bank-balance-error" role="alert" className="mt-1 text-xs text-cap-danger-text">{validation.errors.balance}</p>
                ) : (
                  <p id="bank-balance-hint" className="mt-1 text-xs text-cap-text-muted">Le montant affiché par ta banque aujourd’hui.</p>
                )}
              </div>
              <button type="submit" disabled={saving} className="rounded-xl bg-cap-primary px-4 text-sm font-bold text-cap-on-primary hover:bg-cap-primary-strong">
                OK
              </button>
              <button
                type="button"
                aria-label="Annuler la modification du solde"
                disabled={saving}
                onClick={() => { setSaveError(''); setStep('view'); }}
                className="flex items-center justify-center rounded-xl bg-cap-background text-cap-text hover:bg-cap-border"
              >
                <Icon icon={X} className="size-5" />
              </button>
            </div>
            <OverdrawnCheckbox checked={overdrawn} onChange={setOverdrawn} />
          </form>
        )}

        {step === 'passed' && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save(amount, passed.filter((item) => checked.has(keyOf(item))));
            }}
            className="space-y-3 py-1"
          >
            <fieldset>
              <legend className="text-sm font-semibold text-cap-text">
                Qu’est-ce qui est déjà passé sur ton compte ?
              </legend>
              <p className="mt-1 text-xs text-cap-text-muted">
                Coche ce que ton solde de {formatCurrency(amount)} contient déjà. Ces montants sont déjà compris dans ton solde.
                Les opérations non cochées restent ouvertes.
              </p>
              <ul className="mt-2 divide-y divide-cap-border rounded-xl border border-cap-border bg-white">
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
                          className="size-5 shrink-0 accent-[var(--cap-primary)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-cap-text">{item.label}</span>
                          <span className="block text-xs text-cap-text-muted">
                            Prévu le <time dateTime={item.dueDate}>{formatShortDate(item.dueDate)}</time>
                          </span>
                        </span>
                        <span className={`shrink-0 text-sm font-semibold tabular-nums ${item.amountCents > 0 ? 'text-cap-success-text' : 'text-cap-text'}`}>
                          {item.amountCents > 0 ? '+' : ''}{formatCurrency(fromCents(item.amountCents))}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={saving} className="rounded-xl bg-cap-primary px-4 text-sm font-bold text-cap-on-primary hover:bg-cap-primary-strong">
                Enregistrer le solde
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => { setSaveError(''); setStep('amount'); }}
                className="rounded-xl border border-cap-border-strong bg-cap-surface px-4 text-sm font-semibold text-cap-text"
              >
                Retour
              </button>
            </div>
          </form>
        )}

        {step === 'view' && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon icon={Landmark} className="size-5 shrink-0 text-cap-primary-text" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-cap-text">Solde bancaire</p>
                <p className="text-xs text-cap-text-muted">
                  {balanceDate
                    ? <>Au <time dateTime={balanceDate}>{formatShortDate(balanceDate)}</time></>
                    : 'À mettre à jour depuis ton compte'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-cap-text">{formatCurrency(currentBalance)}</span>
              <button
                type="button"
                onClick={startEdit}
                aria-label={freshness.stale ? 'Mettre à jour le solde bancaire' : 'Modifier le solde bancaire'}
                className={freshness.stale
                  ? 'inline-flex items-center gap-1 rounded-xl bg-cap-primary px-3 text-xs font-semibold text-cap-on-primary hover:bg-cap-primary-strong'
                  : 'inline-flex items-center gap-1 rounded-xl border border-cap-border bg-cap-surface-soft px-3 text-xs font-semibold text-cap-primary-text hover:bg-cap-border'}
              >
                <Icon icon={freshness.stale ? RefreshCw : Pencil} className="size-3.5" />
                {freshness.stale ? 'Mettre à jour' : 'Modifier'}
              </button>
            </div>
          </div>
        )}
        {step === 'view' && freshness.stale && freshness.days !== null && (
          <p className="mt-1.5 rounded-lg bg-cap-warning-soft px-2.5 py-1.5 text-xs font-medium text-cap-warning-text">
            Recopié {ageLabel(freshness.days)}
            {freshness.passedSince > 0 && (
              <> · {freshness.passedSince} {freshness.passedSince === 1 ? 'échéance est passée' : 'échéances sont passées'} depuis</>
            )}
            . Recopie le solde de ta banque pour un disponible juste.
          </p>
        )}
        {saveError && (
          <div className="mt-2 text-xs text-cap-danger-text">
            <p role="alert">{saveError}</p>
            {!household && <button type="button" onClick={resumeAfterReload}
              className="min-h-11 font-semibold underline">Recharger le budget</button>}
          </div>
        )}
        {step === 'view' && feedback && <p role="status" className="mt-1 text-xs text-cap-success-text">{feedback}</p>}
      </div>
      <Link
        href={household ? '/foyer#reserve' : '/reglages#reserve'}
        className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 hover:bg-cap-surface-soft"
      >
        <span className="flex items-center gap-2.5 text-sm font-medium text-cap-text">
          <Icon icon={ShieldCheck} className="size-5 text-cap-primary-text" />
          Réserve de sécurité
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-cap-text">
          {formatCurrency(userProfile.safetyReserve)}
          <Icon icon={ChevronRight} className="size-4 text-cap-text-muted" />
        </span>
      </Link>
    </div>
  );
}
