'use client';

import Link from 'next/link';
import { Calculator } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import SummaryCard from '@/components/dashboard/SummaryCard';
import BudgetOnboarding, { OnboardingResult } from '@/components/onboarding/BudgetOnboarding';
import AccountChoice from '@/components/onboarding/AccountChoice';
import { accountSignupEnabled, useCloudSync } from '@/components/sync/CloudSyncProvider';
import { VaultProgress } from '@/components/sync/CloudAccountSection';
import DailyBalanceCurve from '@/components/dashboard/DailyBalanceCurve';
import UpcomingDeadlines from '@/components/dashboard/UpcomingDeadlines';
import AdviceWidget from '@/components/dashboard/AdviceWidget';
import BackupStatus from '@/components/dashboard/BackupStatus';
import BalanceRows from '@/components/dashboard/BalanceRows';
import PaymentUndoToast from '@/components/budget/PaymentUndoToast';
import NewSpendingAction from '@/components/spending/NewSpendingAction';
import AlertBanner from '@/components/ui/AlertBanner';
import { Icon } from '@/components/ui/icons';
import { getUpcomingReminders, formatDate, hasUndatedPayments } from '@/lib/budget-calculations';
import type { Reminder } from '@/lib/types';
import { useHouseholdWorkspace } from '@/components/household/HouseholdWorkspace';
import { HouseholdContributionList } from '@/components/household/HouseholdContributions';
import { householdAttention } from '@/lib/household-contributions';
import { householdCopy } from '@/lib/household-copy';

export default function DashboardPage() {
  const { isBudgetLoading, needsOnboarding } = useApp();
  const { active: household } = useHouseholdWorkspace();
  const { firstBudgetResult, initialVaultConfirmed, dismissFirstBudgetResult } = useCloudSync();
  const [budgetStarted, setBudgetStarted] = useState(false);
  const [showFirstResult, setShowFirstResult] = useState(false);

  if (isBudgetLoading) {
    return <p role="status" className="px-4 py-6 text-sm text-gray-600">Chargement du budget…</p>;
  }
  if (household) return <SavedBudgetDashboard />;
  if (showFirstResult) return <OnboardingResult onContinue={() => setShowFirstResult(false)} />;
  if (firstBudgetResult && initialVaultConfirmed) return <OnboardingResult onContinue={dismissFirstBudgetResult} onlineCopy />;
  if (needsOnboarding && accountSignupEnabled && !budgetStarted) return <AccountChoice onStartBudget={() => setBudgetStarted(true)} />;
  if (needsOnboarding) return <BudgetOnboarding onComplete={() => setShowFirstResult(true)} />;

  return <><VaultProgress /><SavedBudgetDashboard /></>;
}

function SavedBudgetDashboard() {
  const { active: household } = useHouseholdWorkspace();
  const state = useApp();
  const joint = !household || state.hasJointAccount !== false;
  const {
    summary, advice, expenses, debts, balanceDate, storageBlocked, today, goals, lastBackupDate,
    recordScheduledPayment, undoScheduledPayment, lastAddedSpendingId,
  } = state;
  const [paymentFeedback, setPaymentFeedback] = useState<{ reminder: Reminder; paid: boolean }>();
  const [paymentError, setPaymentError] = useState('');
  const undoButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (paymentFeedback?.paid) undoButton.current?.focus({ preventScroll: true });
  }, [paymentFeedback]);

  const reminders = getUpcomingReminders(expenses, debts, [], today, summary.availableForecast.horizon);
  const hasAnnualProvision = summary.availableForecast.annualProvision > 0;
  const attention = household && joint && balanceDate ? householdAttention(state, today) : null;

  function pay(reminder: Reminder) {
    if ((reminder.type !== 'expense' && reminder.type !== 'debt') || !reminder.refId) return;
    try {
      recordScheduledPayment({ type: reminder.type, id: reminder.refId, dueDate: reminder.dueDate });
      setPaymentFeedback({ reminder, paid: true });
      setPaymentError('');
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Impossible d’enregistrer le paiement.');
    }
  }

  function undo() {
    if (!paymentFeedback?.paid) return;
    try {
      undoScheduledPayment();
      setPaymentFeedback({ reminder: paymentFeedback.reminder, paid: false });
      setPaymentError('');
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Impossible d’annuler le paiement.');
    }
  }

  return (
    <div className={`space-y-4 px-4 py-4 ${paymentFeedback?.paid || paymentError || lastAddedSpendingId ? 'pb-28' : ''}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Aujourd’hui</h1>
        <time dateTime={today} className="text-sm text-gray-600">{formatDate(today)}</time>
      </header>

      {storageBlocked && (
        <AlertBanner variant="warning" title="Stockage indisponible">
          Les données enregistrées ne peuvent pas être mises à jour dans ce navigateur.
        </AlertBanner>
      )}

      {joint && <SummaryCard summary={summary} hasUndatedPayments={hasUndatedPayments(expenses, debts)}
        hasRecordedBalance={Boolean(balanceDate)} inHousehold={household}>
        <BalanceRows />
      </SummaryCard>}
      {!joint && <p className="text-sm text-slate-700">{householdCopy.noJointAccount}</p>}

      <div className="flex flex-wrap gap-2">
        <NewSpendingAction onOpen={() => { setPaymentFeedback(undefined); setPaymentError(''); }} />
        {joint && (!summary.emptyBudget || balanceDate) && (
          <Link href="/simulation" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50">
            <Icon icon={Calculator} />
            Simuler un achat
          </Link>
        )}
      </div>

      {attention && <AlertBanner variant="warning" title={householdCopy.attention}>{attention}</AlertBanner>}
      {!household && summary.riskLevel === 'danger' && (
        <AlertBanner variant="danger" title="Découvert prévu">
          Le solde prévisionnel passe sous zéro sur la période.
        </AlertBanner>
      )}
      {!household && summary.riskLevel === 'fragile' && (
        <AlertBanner variant="warning" title={hasAnnualProvision ? 'Sous le montant à garder' : 'Sous la réserve de sécurité'}>
          Ton solde prévu descend sous ta réserve{hasAnnualProvision && ' et tes provisions'}. Évite les dépenses imprévues.
        </AlertBanner>
      )}

      {household && joint && <HouseholdContributionList />}
      {joint && !summary.emptyBudget && (
        <UpcomingDeadlines
          reminders={reminders}
          today={today}
          horizon={summary.availableForecast.horizon}
          onPay={pay}
          payDisabled={storageBlocked}
        />
      )}
      {!household && <BackupStatus today={today} lastBackupDate={lastBackupDate} hasBudget={!summary.emptyBudget || Boolean(balanceDate) || goals.length > 0} />}
      {joint && (!summary.emptyBudget || balanceDate) && (
        <DailyBalanceCurve
          points={summary.availableForecast.dailyBalances}
          lowestDate={summary.availableForecast.date}
          reserve={summary.availableForecast.reservedAmount}
          includesAnnualProvision={hasAnnualProvision}
        />
      )}

      {advice.length > 0 && <AdviceWidget advice={advice} />}

      <PaymentUndoToast
        label={paymentFeedback?.reminder.label}
        paid={Boolean(paymentFeedback?.paid)}
        error={paymentError}
        onUndo={undo}
        undoRef={undoButton}
      />
    </div>
  );
}
