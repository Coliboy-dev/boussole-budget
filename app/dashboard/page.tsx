'use client';

import Link from 'next/link';
import { Calculator } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import SummaryCard from '@/components/dashboard/SummaryCard';
import BudgetOnboarding, { OnboardingResult } from '@/components/onboarding/BudgetOnboarding';
import DailyBalanceCurve from '@/components/dashboard/DailyBalanceCurve';
import UpcomingDeadlines from '@/components/dashboard/UpcomingDeadlines';
import AdviceWidget from '@/components/dashboard/AdviceWidget';
import BackupStatus from '@/components/dashboard/BackupStatus';
import BalanceRows from '@/components/dashboard/BalanceRows';
import PaymentUndoToast from '@/components/budget/PaymentUndoToast';
import AlertBanner from '@/components/ui/AlertBanner';
import { Icon } from '@/components/ui/icons';
import { getUpcomingReminders, formatDate, hasUndatedPayments } from '@/lib/budget-calculations';
import type { Reminder } from '@/lib/types';

export default function DashboardPage() {
  const { isBudgetLoading, needsOnboarding } = useApp();
  const [showFirstResult, setShowFirstResult] = useState(false);

  if (isBudgetLoading) {
    return <p role="status" className="px-4 py-6 text-sm text-gray-600">Chargement du budget…</p>;
  }
  if (showFirstResult) return <OnboardingResult onContinue={() => setShowFirstResult(false)} />;
  if (needsOnboarding) return <BudgetOnboarding onComplete={() => setShowFirstResult(true)} />;

  return <SavedBudgetDashboard />;
}

function SavedBudgetDashboard() {
  const {
    summary, advice, expenses, debts, balanceDate, storageBlocked, today, goals, lastBackupDate,
    recordScheduledPayment, undoScheduledPayment,
  } = useApp();
  const [paymentFeedback, setPaymentFeedback] = useState<{ reminder: Reminder; paid: boolean }>();
  const [paymentError, setPaymentError] = useState('');
  const undoButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (paymentFeedback?.paid) undoButton.current?.focus({ preventScroll: true });
  }, [paymentFeedback]);

  const reminders = getUpcomingReminders(expenses, debts, [], today, summary.availableForecast.horizon);
  const hasAnnualProvision = summary.availableForecast.annualProvision > 0;

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
    <div className={`space-y-4 px-4 py-4 ${paymentFeedback?.paid || paymentError ? 'pb-28' : ''}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Aujourd’hui</h1>
        <time dateTime={today} className="text-sm text-gray-600">{formatDate(today)}</time>
      </header>

      {storageBlocked && (
        <AlertBanner variant="warning" title="Stockage indisponible">
          Les données enregistrées ne peuvent pas être mises à jour dans ce navigateur.
        </AlertBanner>
      )}

      <SummaryCard summary={summary} hasUndatedPayments={hasUndatedPayments(expenses, debts)} hasRecordedBalance={Boolean(balanceDate)}>
        <BalanceRows />
      </SummaryCard>

      {(!summary.emptyBudget || balanceDate) && (
        <Link href="/simulation" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50">
          <Icon icon={Calculator} />
          Simuler un achat
        </Link>
      )}

      {summary.riskLevel === 'danger' && (
        <AlertBanner variant="danger" title="Découvert prévu">
          Le solde prévisionnel passe sous zéro sur la période.
        </AlertBanner>
      )}
      {summary.riskLevel === 'fragile' && (
        <AlertBanner variant="warning" title={hasAnnualProvision ? 'Sous le montant à garder' : 'Sous la réserve de sécurité'}>
          Ton solde prévu descend sous ta réserve{hasAnnualProvision && ' et tes provisions'}. Évite les dépenses imprévues.
        </AlertBanner>
      )}

      {!summary.emptyBudget && (
        <UpcomingDeadlines
          reminders={reminders}
          horizon={summary.availableForecast.horizon}
          onPay={pay}
          payDisabled={storageBlocked}
        />
      )}
      <BackupStatus today={today} lastBackupDate={lastBackupDate} hasBudget={!summary.emptyBudget || Boolean(balanceDate) || goals.length > 0} />
      {(!summary.emptyBudget || balanceDate) && (
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
