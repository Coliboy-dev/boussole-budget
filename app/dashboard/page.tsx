'use client';

import Link from 'next/link';
import { CalendarDays, Calculator, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import SummaryCard from '@/components/dashboard/SummaryCard';
import BudgetOnboarding, { OnboardingResult } from '@/components/onboarding/BudgetOnboarding';
import AccountChoice from '@/components/onboarding/AccountChoice';
import { accountSignupEnabled, useCloudSync } from '@/components/sync/CloudSyncProvider';
import { VaultProgress } from '@/components/sync/CloudAccountSection';
import ProjectionCurve from '@/components/projection/ProjectionCurve';
import UpcomingDeadlines from '@/components/dashboard/UpcomingDeadlines';
import AdviceWidget from '@/components/dashboard/AdviceWidget';
import BackupStatus from '@/components/dashboard/BackupStatus';
import BalanceRows from '@/components/dashboard/BalanceRows';
import PaymentUndoToast from '@/components/budget/PaymentUndoToast';
import NewSpendingAction, { quickActionTile } from '@/components/spending/NewSpendingAction';
import AlertBanner from '@/components/ui/AlertBanner';
import { Icon } from '@/components/ui/icons';
import { getUpcomingReminders, formatCurrency, formatDate, formatShortDate, hasUndatedPayments } from '@/lib/budget-calculations';
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

  const forecast = summary.availableForecast;
  const reminders = getUpcomingReminders(expenses, debts, [], today, forecast.horizon);
  const hasAnnualProvision = forecast.annualProvision > 0;
  const partial = hasUndatedPayments(expenses, debts);
  const hasProjection = !summary.emptyBudget || Boolean(balanceDate);
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
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-cap-text">Aujourd’hui</h1>
        <p className="text-sm text-cap-text-muted">
          Ton argent, en clair, au <time dateTime={today}>{formatDate(today)}</time>.
        </p>
      </header>

      {storageBlocked && (
        <AlertBanner variant="warning" title="Stockage indisponible">
          Les données enregistrées ne peuvent pas être mises à jour dans ce navigateur.
        </AlertBanner>
      )}

      {joint && <SummaryCard summary={summary} hasUndatedPayments={partial}
        hasRecordedBalance={Boolean(balanceDate)} inHousehold={household}>
        <BalanceRows />
      </SummaryCard>}
      {!joint && <p className="text-sm text-cap-text">{householdCopy.noJointAccount}</p>}

      {attention && <AlertBanner variant="warning" title={householdCopy.attention}>{attention}</AlertBanner>}
      {!household && (summary.riskLevel === 'danger' || summary.riskLevel === 'fragile') && (
        <RiskNotice
          danger={summary.riskLevel === 'danger'}
          lowest={forecast.balance}
          date={forecast.date}
          causes={forecast.causes.slice(0, 2).join(', ')}
          reserve={forecast.reservedAmount}
          withProvision={hasAnnualProvision}
        />
      )}

      {joint && partial && (
        <div className="flex gap-2 rounded-2xl border border-cap-secondary/20 bg-cap-secondary-soft px-3 py-3 text-sm text-cap-text">
          <Icon icon={Info} className="mt-0.5 size-4 shrink-0 text-cap-secondary-text" />
          <p>
            <strong>Projection à compléter.</strong> Renseigne les dates des charges et mensualités pour les inclure.{' '}
            <Link href="/charges" className="font-semibold text-cap-secondary-text underline">Compléter les dates</Link>
          </p>
        </div>
      )}

      <nav aria-label="Actions rapides" className="grid grid-cols-3 gap-2">
        <NewSpendingAction variant="tile" onOpen={() => { setPaymentFeedback(undefined); setPaymentError(''); }} />
        {joint && hasProjection && (
          <Link href="/simulation" className={`${quickActionTile} bg-cap-secondary-soft text-cap-secondary-text hover:bg-cap-border`}>
            <Icon icon={Calculator} className="size-6" />
            Simuler un achat
          </Link>
        )}
        {/* Sans compte commun, le foyer n'a pas d'écran Échéances (même règle que la navigation). */}
        {joint && (
          <Link href="/projection" className={`${quickActionTile} bg-cap-warning-soft text-cap-warning-text hover:bg-cap-border`}>
            <Icon icon={CalendarDays} className="size-6" />
            Voir les échéances
          </Link>
        )}
      </nav>

      {household && joint && <HouseholdContributionList />}
      {joint && !summary.emptyBudget && (
        <UpcomingDeadlines
          reminders={reminders}
          today={today}
          horizon={forecast.horizon}
          onPay={pay}
          payDisabled={storageBlocked}
        />
      )}
      {joint && hasProjection && (
        <section aria-labelledby="home-curve-heading" className="rounded-[19px] border border-cap-border bg-cap-surface p-4 shadow-[0_1px_2px_rgba(23,44,55,0.04)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="home-curve-heading" className="text-sm font-bold text-cap-text">Évolution du solde</h2>
            <span className="rounded-full bg-cap-secondary-soft px-2 py-1 text-xs font-bold text-cap-secondary-text">{forecast.horizon} jours</span>
          </div>
          <ProjectionCurve
            points={forecast.dailyBalances}
            lowestDate={forecast.date}
            lowestBalance={forecast.balance}
            reserve={forecast.reservedAmount}
            includesAnnualProvision={hasAnnualProvision}
          />
        </section>
      )}
      {!household && <BackupStatus today={today} lastBackupDate={lastBackupDate} hasBudget={!summary.emptyBudget || Boolean(balanceDate) || goals.length > 0} />}

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

/** Risque de l'accueil : le constat chiffré du moteur et le chemin vers l'écran Échéances, qui détaille les actions. */
function RiskNotice({ danger, lowest, date, causes, reserve, withProvision }: {
  danger: boolean; lowest: number; date: string; causes: string; reserve: number; withProvision: boolean;
}) {
  return (
    <section aria-labelledby="home-risk-title" className={`rounded-2xl px-3 py-3 text-sm text-cap-text ${danger ? 'bg-cap-danger-soft' : 'bg-cap-warning-soft'}`}>
      <h2 id="home-risk-title" className={`flex items-start gap-2 font-semibold ${danger ? 'text-cap-danger-text' : 'text-cap-warning-text'}`}>
        <Icon icon={danger ? CircleAlert : TriangleAlert} className="mt-0.5 size-4 shrink-0" />
        {danger ? 'Découvert prévu' : withProvision ? 'Sous le montant à garder' : 'Sous la réserve de sécurité'}
      </h2>
      <p className="mt-1 pl-6">
        Ton solde descendrait à <strong className="tabular-nums">{formatCurrency(lowest)}</strong> le{' '}
        <time dateTime={date}>{formatShortDate(date)}</time>{causes && <>, après {causes}</>}
        {danger ? '.' : <>, sous ta réserve{withProvision && ' et tes provisions'} ({formatCurrency(reserve)}). Évite les dépenses imprévues.</>}
      </p>
      <p className="mt-2 pl-6">
        <Link href="/projection" className="font-semibold text-cap-primary-text underline">Voir le détail et quoi vérifier</Link>
      </p>
    </section>
  );
}
