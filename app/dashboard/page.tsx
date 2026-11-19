'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/context/AppContext';
import SummaryCard from '@/components/dashboard/SummaryCard';
import BudgetChart from '@/components/dashboard/BudgetChart';
import UpcomingDeadlines from '@/components/dashboard/UpcomingDeadlines';
import AdviceWidget from '@/components/dashboard/AdviceWidget';
import FormField from '@/components/forms/FormField';
import { useFormValidation } from '@/components/forms/useFormValidation';
import AlertBanner from '@/components/ui/AlertBanner';
import Card from '@/components/ui/Card';
import { getUpcomingReminders, formatCurrency, formatDate } from '@/lib/budget-calculations';
import { isBudgetAmount, isNonNegativeBudgetAmount } from '@/lib/budget-schema';
import { isLocalDate } from '@/lib/local-date';
import { fromCents, toCents } from '@/lib/money';

export default function DashboardPage() {
  const {
    summary, advice, userProfile, expenses, debts, currentBalance, setBalance,
    balanceDate, storageBlocked, today, updateProfile,
  } = useApp();
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');
  const balanceValidation = useFormValidation();
  const reserveValidation = useFormValidation();
  const firstName = userProfile.firstName?.trim();

  const reminders = getUpcomingReminders(expenses, debts, [], today);
  const hasUndatedPayments = expenses.some((expense) => !expense.isPaid && !isLocalDate(expense.dueDate))
    || debts.some((debt) => debt.monthlyPayment > 0 && debt.remainingAmount > 0
      && debt.status !== 'suspended' && debt.status !== 'completed' && debt.status !== 'late'
      && !isLocalDate(debt.nextDueDate));

  function handleBalanceSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const val = parseFloat(balanceInput.replace(',', '.'));
    if (!balanceValidation.validate(e.currentTarget, {
      balance: isBudgetAmount(val) ? undefined : 'Saisis un montant de solde valide.',
    })) return;
    setBalance(val);
    setEditingBalance(false);
  }

  function startEditBalance() {
    balanceValidation.reset();
    setBalanceInput(currentBalance.toString());
    setEditingBalance(true);
  }

  function handleReserveSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('reserve') ?? '');
    const amount = Number(value);
    if (!reserveValidation.validate(event.currentTarget, {
      reserve: value !== '' && isNonNegativeBudgetAmount(amount) ? undefined : 'Saisis un montant valide et positif ou nul.',
    })) return;
    updateProfile({ safetyReserve: fromCents(toCents(amount)) });
  }

  const quickLinks = [
    { href: '/revenus', label: 'Revenus', icon: '💰' },
    { href: '/charges', label: 'Charges', icon: '📋' },
    { href: '/dettes', label: 'Dettes', icon: '💳' },
    { href: '/objectifs', label: 'Objectifs', icon: '🎯' },
    { href: '/conseils', label: 'Conseils', icon: '💡' },
  ];

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            {firstName ? `Bonjour ${firstName}` : 'Bonjour'} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Voici ta situation financière</p>
        </div>
      </div>

      {/* Balance card — editable */}
      {storageBlocked && (
        <AlertBanner variant="warning" title="Stockage indisponible">
          Les données enregistrées ne peuvent pas être mises à jour dans ce navigateur.
        </AlertBanner>
      )}
      <Card className="bg-white border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p id="bank-balance-label" className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
              Solde bancaire actuel
            </p>
            {editingBalance ? (
              <form onSubmit={handleBalanceSubmit} onChange={balanceValidation.clearFieldError} noValidate className="flex items-start gap-2">
                <div>
                  <input
                    autoFocus
                    name="balance"
                    aria-labelledby="bank-balance-label"
                    aria-invalid={balanceValidation.errors.balance ? true : undefined}
                    aria-describedby={balanceValidation.errors.balance ? 'bank-balance-error' : undefined}
                    type="number"
                    step="0.01"
                    required
                    value={balanceInput}
                    onChange={(e) => setBalanceInput(e.target.value)}
                    className="w-36 border border-teal-300 rounded-xl px-3 py-1.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder="0,00"
                  />
                  {balanceValidation.errors.balance && (
                    <p id="bank-balance-error" role="alert" className="mt-1 text-xs text-red-700">
                      {balanceValidation.errors.balance}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-teal-500 text-white text-sm font-bold rounded-xl hover:bg-teal-600"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => setEditingBalance(false)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-200"
                >
                  ✕
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-2xl font-bold text-gray-800">
                  {formatCurrency(currentBalance)}
                </p>
                <button
                  onClick={startEditBalance}
                  className="text-xs text-teal-500 font-semibold bg-teal-50 px-2.5 py-1 rounded-lg hover:bg-teal-100 transition-colors"
                >
                  Modifier
                </button>
              </div>
            )}
          </div>
          <div className="text-3xl">🏦</div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {balanceDate ? `Solde au ${formatDate(balanceDate)}.` : 'Mets à jour ton solde depuis ton compte.'}
        </p>
      </Card>

      <Card className="space-y-2">
        <details>
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            Réserve de sécurité · {formatCurrency(userProfile.safetyReserve)}
          </summary>
          <form onSubmit={handleReserveSubmit} onChange={reserveValidation.clearFieldError} noValidate className="mt-3 flex flex-wrap items-start gap-2">
            <FormField label="Montant de la réserve (€)" required error={reserveValidation.errors.reserve}>
              <input
                key={userProfile.safetyReserve}
                name="reserve"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={userProfile.safetyReserve}
                className="mt-1 block w-36 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              />
            </FormField>
            <button type="submit" className="mt-6 rounded-lg bg-teal-700 px-3 py-2 text-xs font-medium text-white">
              Enregistrer la réserve
            </button>
          </form>
        </details>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-teal-700">
          <Link href="/sauvegarde" className="underline">Sauvegarder ou restaurer le budget</Link>
          <Link href="/demo" prefetch={false} className="underline">Voir un budget de démonstration</Link>
        </div>
      </Card>

      {/* Alert banners */}
      {summary.riskLevel === 'danger' && (
        <AlertBanner variant="danger" title="Situation critique">
          Le solde prévisionnel passe sous zéro sur la période.
        </AlertBanner>
      )}
      {summary.riskLevel === 'fragile' && (
        <AlertBanner variant="warning" title="Budget fragile">
          Ta marge est très limitée ce mois-ci. Évite les dépenses imprévues.
        </AlertBanner>
      )}

      {/* Summary cards */}
      <SummaryCard summary={summary} hasUndatedPayments={hasUndatedPayments} />

      {/* Budget breakdown */}
      <BudgetChart summary={summary} />

      {/* Upcoming deadlines */}
      {reminders.length > 0 && <UpcomingDeadlines reminders={reminders} />}

      {/* Advice */}
      {advice.length > 0 && <AdviceWidget advice={advice} />}

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-2 px-1">Accès rapide</h2>
        <div className="grid grid-cols-3 gap-2">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-white rounded-2xl border border-gray-100 p-3 flex flex-col items-center gap-1 shadow-sm hover:shadow-md hover:border-teal-200 transition-all"
            >
              <span className="text-2xl">{link.icon}</span>
              <span className="text-xs font-semibold text-gray-700 text-center">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
