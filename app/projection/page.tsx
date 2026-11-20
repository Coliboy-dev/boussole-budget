'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { AVAILABLE_HORIZON, buildProjection, type ProjectionEvent } from '@/lib/projection';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import { addDays } from '@/lib/local-date';
import { fromCents, toCents } from '@/lib/money';
import ProjectionTimeline from '@/components/projection/ProjectionTimeline';
import ProjectionEventList from '@/components/projection/ProjectionEventList';
import Card from '@/components/ui/Card';
import AlertBanner from '@/components/ui/AlertBanner';

const HORIZONS = [7, 15, 30, AVAILABLE_HORIZON] as const;
type Horizon = (typeof HORIZONS)[number];

export default function ProjectionPage() {
  const {
    currentBalance, balanceDate, incomes, expenses, debts, childExpenses, userProfile, today, summary,
    isBudgetLoading, storageBlocked, recordScheduledPayment, undoScheduledPayment,
  } = useApp();
  const [horizon, setHorizon] = useState<Horizon>(AVAILABLE_HORIZON);
  const [paymentFeedback, setPaymentFeedback] = useState<{ event: ProjectionEvent; paid: boolean }>();
  const [paymentError, setPaymentError] = useState('');
  const undoButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!paymentFeedback) return;
    const target = paymentFeedback.paid
      ? undoButton.current
      : document.getElementById(`pay-${paymentFeedback.event.id}`);
    target?.focus({ preventScroll: true });
  }, [paymentFeedback]);

  function pay(event: ProjectionEvent) {
    if (event.type !== 'expense' && event.type !== 'debt') return;
    try {
      recordScheduledPayment({ type: event.type, id: event.sourceId, dueDate: event.dueDate });
      setPaymentFeedback({ event, paid: true });
      setPaymentError('');
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Impossible d’enregistrer le paiement.');
    }
  }

  function undo() {
    if (!paymentFeedback?.paid) return;
    try {
      undoScheduledPayment();
      setPaymentFeedback({ event: paymentFeedback.event, paid: false });
      setPaymentError('');
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Impossible d’annuler le paiement.');
    }
  }

  if (isBudgetLoading) {
    return <p role="status" className="px-4 py-6 text-sm text-gray-600">Chargement du budget…</p>;
  }

  const projection = buildProjection(
    currentBalance,
    incomes,
    expenses,
    debts,
    childExpenses,
    userProfile.safetyReserve,
    { today, horizon },
  );

  const { events, milestones } = projection;
  const endMilestone = milestones.at(-1);
  const endBalance = endMilestone?.balance ?? currentBalance;
  const endRisk = endMilestone?.riskLevel ?? 'safe';

  const confirmedIncome = events
    .filter((event) => event.amount > 0 && !event.isEstimated)
    .reduce((sum, event) => sum + toCents(event.amount), 0);
  const estimatedIncome = events
    .filter((event) => event.amount > 0 && event.isEstimated)
    .reduce((sum, event) => sum + toCents(event.amount), 0);
  const totalExpenses = events
    .filter((event) => event.type === 'expense')
    .reduce((sum, event) => sum - toCents(event.amount), 0);
  const totalDebts = events
    .filter((event) => event.type === 'debt')
    .reduce((sum, event) => sum - toCents(event.amount), 0);

  const availableThrough = addDays(today, summary.availableForecast.horizon);

  return (
    <div className={`space-y-4 px-4 py-4 ${paymentFeedback?.paid || paymentError ? 'pb-28' : ''}`}>
      <h1 className="text-xl font-bold text-gray-900">Échéancier</h1>
      {storageBlocked && (
        <AlertBanner variant="warning" title="Stockage indisponible">
          Les paiements ne peuvent pas être enregistrés dans ce navigateur.
        </AlertBanner>
      )}
      {(!summary.emptyBudget || balanceDate) && (
        <Card>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs font-semibold text-gray-600">Solde bancaire</dt>
              <dd className="wrap-break-word text-xl font-bold text-gray-900 tabular-nums">{formatCurrency(currentBalance)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-gray-600">Vrai disponible</dt>
              <dd className="wrap-break-word text-xl font-bold text-teal-800 tabular-nums">{formatCurrency(summary.trueAvailable)}</dd>
              <dd className="text-xs text-gray-600">
                Jusqu’au <time dateTime={availableThrough}>{formatShortDate(availableThrough)}</time>
              </dd>
            </div>
          </dl>
        </Card>
      )}

      <Card padding="sm">
        <p className="text-xs font-semibold text-gray-600 mb-2 px-1">Horizon de projection</p>
        <div className="flex gap-2">
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={horizon === h}
              onClick={() => setHorizon(h)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${
                horizon === h
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {h} jours
            </button>
          ))}
        </div>
      </Card>

      {events.some((event) => event.amount < 0) && (
        <p className="text-xs leading-relaxed text-gray-600">
          « Payé » déduit le montant du solde. Si le paiement y figure déjà, enregistre-le depuis{' '}
          <Link href="/charges" className="font-medium text-teal-800 underline">Charges</Link> ou{' '}
          <Link href="/dettes" className="font-medium text-teal-800 underline">Dettes</Link>.
        </p>
      )}
      <ProjectionEventList events={events} today={today} horizon={horizon} onPay={pay} storageBlocked={storageBlocked} />

      {projection.safetyWarning && (
        <AlertBanner variant="warning" title="Attention — solde bas prévu">
          Ton solde pourrait descendre sous{' '}
          <strong>{formatCurrency(userProfile.safetyReserve)}</strong> le{' '}
          <strong>{formatShortDate(projection.lowestDate)}</strong>.
        </AlertBanner>
      )}

      <Card>
        <h2 className="text-sm font-semibold text-gray-600 mb-4">Évolution du solde</h2>
        <ProjectionTimeline milestones={milestones} />
      </Card>

      {/* End balance summary */}
      <Card
        className={
          endRisk === 'danger'
            ? 'bg-red-50 border-red-200'
            : endRisk === 'fragile'
              ? 'bg-amber-50 border-amber-200'
              : 'bg-green-50 border-green-200'
        }
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
          Solde prudent dans {horizon} jours
        </p>
        <p
          className={`text-3xl font-bold mb-2 ${
            endRisk === 'danger'
              ? 'text-red-700'
              : endRisk === 'fragile'
                ? 'text-amber-800'
                : 'text-green-700'
          }`}
        >
          {formatCurrency(endBalance)}
        </p>

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-2 text-xs border-t border-gray-200 pt-3">
          <div>
            <p className="text-gray-600">Solde aujourd&apos;hui</p>
            <p className="font-bold text-gray-700">{formatCurrency(currentBalance)}</p>
          </div>
          <div>
            <p className="text-gray-600">Revenus certains</p>
            <p className="font-bold text-green-800">
              +{formatCurrency(fromCents(confirmedIncome))}
              {estimatedIncome > 0 && (
                <span className="text-gray-600 font-normal ml-1">
                  (+{formatCurrency(fromCents(estimatedIncome))} incertains)
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Charges prévues</p>
            <p className="font-bold text-gray-600">-{formatCurrency(fromCents(totalExpenses))}</p>
          </div>
          <div>
            <p className="text-gray-600">Remboursements dettes</p>
            <p className="font-bold text-amber-800">-{formatCurrency(fromCents(totalDebts))}</p>
          </div>
        </div>
      </Card>

      {/* Disclaimer */}
      <Card className="bg-gray-50 border-dashed border-gray-200">
        <p className="text-xs text-gray-600 text-center leading-relaxed">
          📊 Cette projection est basée sur tes données actuelles. Les montants marqués
          &quot;estimés&quot; sont approximatifs. Les dates et montants réels peuvent varier.
          Ne prends pas de décision financière importante basée uniquement sur cette projection.
        </p>
      </Card>

      <p role="status" className="sr-only">
        {paymentFeedback && (paymentFeedback.paid
          ? `Paiement enregistré pour ${paymentFeedback.event.label}.`
          : `Paiement annulé pour ${paymentFeedback.event.label}.`)}
      </p>
      {(paymentFeedback?.paid || paymentError) && (
        <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-2xl px-4 pb-2">
          <div className="rounded-xl border border-teal-900 bg-teal-950 px-3 py-2 text-white shadow-lg">
            {paymentError && <p role="alert" className="py-1 text-sm">{paymentError}</p>}
            {paymentFeedback?.paid && (
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 wrap-break-word text-sm">
                  Paiement enregistré <span className="block text-xs text-teal-100">{paymentFeedback.event.label}</span>
                </p>
                <button
                  type="button"
                  ref={undoButton}
                  onClick={undo}
                  className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-white underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
