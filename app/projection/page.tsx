'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Info, ShieldCheck, TriangleAlert, CircleAlert } from 'lucide-react';
import { useApp } from '@/lib/context/AppContext';
import { AVAILABLE_HORIZON, buildProjection, type ProjectionEvent } from '@/lib/projection';
import { formatCurrency, formatShortDate, hasUndatedPayments } from '@/lib/budget-calculations';
import { addDays } from '@/lib/local-date';
import { fromCents, toCents } from '@/lib/money';
import { envelopesOf, spendingsOf } from '@/lib/spending';
import ProjectionTimeline, { RiskChip, riskStyles } from '@/components/projection/ProjectionTimeline';
import ProjectionEventList from '@/components/projection/ProjectionEventList';
import ProjectionCurve from '@/components/projection/ProjectionCurve';
import AlertBanner from '@/components/ui/AlertBanner';
import { Icon } from '@/components/ui/icons';
import PaymentUndoToast from '@/components/budget/PaymentUndoToast';

const HORIZONS = [7, 15, 30, AVAILABLE_HORIZON] as const;
type Horizon = (typeof HORIZONS)[number];

const surface = 'rounded-[19px] border border-cap-border bg-cap-surface p-4 shadow-[0_1px_2px_rgba(23,44,55,0.04)]';

export default function ProjectionPage() {
  const state = useApp();
  const {
    currentBalance, balanceDate, incomes, expenses, debts, childExpenses, userProfile, today, summary,
    isBudgetLoading, storageBlocked, recordScheduledPayment, undoScheduledPayment,
  } = state;
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
    return <p role="status" className="px-4 py-6 text-sm text-cap-text-muted">Chargement du budget…</p>;
  }

  const projection = buildProjection(
    currentBalance,
    incomes,
    expenses,
    debts,
    childExpenses,
    userProfile.safetyReserve,
    { today, horizon, envelopes: envelopesOf(state), spendings: spendingsOf(state) },
  );

  const { events, milestones } = projection;
  const endMilestone = milestones.at(-1);
  const endBalance = endMilestone?.balance ?? currentBalance;
  const endRisk = endMilestone?.riskLevel ?? 'safe';
  const endDate = endMilestone?.date ?? today;

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
  const totalEnvelopes = events
    .filter((event) => event.type === 'envelope')
    .reduce((sum, event) => sum - toCents(event.amount), 0);

  const availableThrough = addDays(today, summary.availableForecast.horizon);
  const partial = hasUndatedPayments(expenses, debts);
  const reserveLabel = projection.annualProvision > 0 ? 'ta réserve et tes provisions' : 'ta réserve';
  const missingForReserve = fromCents(toCents(projection.reservedAmount) - toCents(projection.lowestBalance));
  const causes = projection.lowestCauses.slice(0, 3).join(', ');
  const optimisticHelps = projection.optimisticLowestBalance > projection.lowestBalance;
  const hasLate = events.some((event) => event.isLate);

  return (
    <div className={`space-y-3 px-4 py-4 ${paymentFeedback?.paid || paymentError ? 'pb-28' : ''}`}>
      <header className="space-y-1 pb-1">
        <h1 className="text-2xl font-bold text-cap-text">Échéances</h1>
        <p className="text-sm text-cap-text-muted">Anticipe tes paiements et garde le contrôle.</p>
      </header>

      {storageBlocked && (
        <AlertBanner variant="warning" title="Stockage indisponible">
          Les paiements ne peuvent pas être enregistrés dans ce navigateur.
        </AlertBanner>
      )}

      {(!summary.emptyBudget || balanceDate) && (
        <dl className="grid grid-cols-2 gap-3">
          <div className={surface}>
            <dt className="text-xs font-semibold text-cap-text-muted">Solde bancaire</dt>
            <dd className="wrap-break-word font-display text-xl font-bold text-cap-text tabular-nums">{formatCurrency(currentBalance)}</dd>
          </div>
          <div className={surface}>
            <dt className="text-xs font-semibold text-cap-text-muted">Vrai disponible</dt>
            <dd className={`wrap-break-word font-display text-xl font-bold tabular-nums ${summary.trueAvailable < 0 ? 'text-cap-danger-text' : 'text-cap-primary-text'}`}>{formatCurrency(summary.trueAvailable)}</dd>
            <dd className="text-xs text-cap-text-muted">
              Jusqu’au <time dateTime={availableThrough}>{formatShortDate(availableThrough)}</time>
            </dd>
          </div>
        </dl>
      )}

      <section aria-labelledby="horizon-heading" className={surface}>
        <h2 id="horizon-heading" className="text-sm font-bold text-cap-text">Horizon de projection</h2>
        <div className="mt-2.5 flex gap-1 rounded-2xl border border-cap-border bg-cap-background p-1">
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={horizon === h}
              onClick={() => setHorizon(h)}
              className={`flex-1 rounded-xl py-2 text-sm font-bold transition-colors duration-200 motion-reduce:transition-none ${
                horizon === h
                  ? 'bg-cap-primary text-cap-on-primary shadow-sm'
                  : 'text-cap-text-muted hover:bg-cap-surface hover:text-cap-text'
              }`}
            >
              {h} jours
            </button>
          ))}
        </div>
      </section>

      {partial && (
        <div className="flex gap-2 rounded-2xl border border-cap-secondary/20 bg-cap-secondary-soft px-3 py-3 text-sm text-cap-text">
          <Icon icon={Info} className="mt-0.5 size-4 shrink-0 text-cap-secondary-text" />
          <p>
            <strong>Projection partielle.</strong> Certaines charges ou mensualités n’ont pas de date et ne figurent pas dans ce calendrier.{' '}
            <Link href="/charges" className="font-semibold text-cap-secondary-text underline">Compléter les dates</Link>
          </p>
        </div>
      )}

      {summary.emptyBudget && !balanceDate ? (
        <div className="flex gap-2 rounded-2xl border border-cap-secondary/20 bg-cap-secondary-soft px-3 py-3 text-sm text-cap-text">
          <Icon icon={Info} className="mt-0.5 size-4 shrink-0 text-cap-secondary-text" />
          <p>
            <strong>Budget à compléter.</strong> Ajoute ton solde, tes{' '}
            <Link href="/revenus" className="font-semibold text-cap-secondary-text underline">revenus</Link> et tes{' '}
            <Link href="/charges" className="font-semibold text-cap-secondary-text underline">charges</Link>{' '}
            pour afficher une projection fiable.
          </p>
        </div>
      ) : (
        <section aria-labelledby="projected-heading" className={surface}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="projected-heading" className="text-sm font-bold text-cap-text">Solde projeté</h2>
            <span className="rounded-full bg-cap-secondary-soft px-2 py-1 text-xs font-bold text-cap-secondary-text">{horizon} jours</span>
          </div>
          <p className="mt-2 text-xs font-semibold text-cap-text-muted">
            Solde prudent dans {horizon} jours, le <time dateTime={endDate}>{formatShortDate(endDate)}</time>
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`font-display text-3xl font-extrabold tracking-tight tabular-nums ${riskStyles[endRisk].text}`}>
              {formatCurrency(endBalance)}
            </span>
            <RiskChip risk={endRisk} />
          </p>
          <div className="mt-3">
            <ProjectionCurve
              key={horizon}
              points={projection.dailyBalances}
              lowestDate={projection.lowestDate}
              lowestBalance={projection.lowestBalance}
              reserve={projection.reservedAmount}
              includesAnnualProvision={projection.annualProvision > 0}
            />
          </div>

          {projection.lowestRisk === 'safe' ? (
            <div className="mt-3 flex gap-2 rounded-2xl bg-cap-surface-soft px-3 py-3 text-sm text-cap-text">
              <Icon icon={ShieldCheck} className="mt-0.5 size-4 shrink-0 text-cap-success-text" />
              <p>
                Point bas : <strong className="tabular-nums">{formatCurrency(projection.lowestBalance)}</strong> le{' '}
                <time dateTime={projection.lowestDate}>{formatShortDate(projection.lowestDate)}</time>.
                Disponible prudent sur {horizon} jours : <strong className="tabular-nums">{formatCurrency(projection.available)}</strong> après{' '}
                {reserveLabel}.
              </p>
            </div>
          ) : (
            <div role="note" aria-labelledby="low-balance-title"
              className={`mt-3 rounded-2xl px-3 py-3 text-sm text-cap-text ${projection.lowestRisk === 'danger' ? 'bg-cap-danger-soft' : 'bg-cap-warning-soft'}`}>
              <p id="low-balance-title" className={`flex items-start gap-2 font-semibold ${projection.lowestRisk === 'danger' ? 'text-cap-danger-text' : 'text-cap-warning-text'}`}>
                <Icon icon={projection.lowestRisk === 'danger' ? CircleAlert : TriangleAlert} className="mt-0.5 size-4 shrink-0" />
                {projection.lowestRisk === 'danger'
                  ? <>Solde négatif prévu le {formatShortDate(projection.lowestDate)}</>
                  : <>Solde sous {reserveLabel} le {formatShortDate(projection.lowestDate)}</>}
              </p>
              <ul className="mt-2 space-y-1.5 pl-6">
                <li>
                  Ton solde descendrait à <strong className="tabular-nums">{formatCurrency(projection.lowestBalance)}</strong> le{' '}
                  <time dateTime={projection.lowestDate}>{formatShortDate(projection.lowestDate)}</time>
                  {causes && <>, après {causes}</>}.
                </li>
                <li>
                  Il manque{' '}
                  {projection.lowestRisk === 'danger' && (
                    <><strong className="tabular-nums">{formatCurrency(-projection.lowestBalance)}</strong> pour rester au-dessus de zéro, et{' '}</>
                  )}
                  <strong className="tabular-nums">{formatCurrency(missingForReserve)}</strong> pour garder {reserveLabel}
                  {' '}(<span className="tabular-nums">{formatCurrency(projection.reservedAmount)}</span>).
                </li>
                {optimisticHelps && (
                  <li>
                    Si tes revenus incertains arrivent, le point bas serait de{' '}
                    <strong className="tabular-nums">{formatCurrency(projection.optimisticLowestBalance)}</strong>.
                  </li>
                )}
              </ul>
              <p className="mt-3 pl-6 font-semibold">À vérifier d’abord</p>
              <ul className="mt-1.5 space-y-1.5 pl-6">
                {hasLate && (
                  <li>
                    Des échéances en retard sont comptées aujourd’hui.{' '}
                    <a href="#en-retard" className="font-semibold text-cap-primary-text underline">Marque-les payées</a> si c’est déjà fait.
                  </li>
                )}
                <li>
                  <Link href="/charges" className="font-semibold text-cap-primary-text underline">Tes charges</Link> : une date ou un
                  montant à corriger, une charge que tu peux décaler ?
                </li>
                <li>
                  <Link href="/revenus" className="font-semibold text-cap-primary-text underline">Tes revenus attendus</Link> : les dates
                  d’arrivée sont-elles justes, un revenu incertain est-il confirmé ?
                </li>
                {projection.lowestRisk === 'fragile' && (
                  <li>
                    Avant un nouvel achat,{' '}
                    <Link href="/simulation" className="font-semibold text-cap-primary-text underline">simule-le</Link> pour voir son effet sur ta réserve.
                  </li>
                )}
              </ul>
            </div>
          )}
        </section>
      )}

      {events.some((event) => event.amount < 0 && (event.type === 'expense' || event.type === 'debt')) && (
        <p className="px-1 text-xs leading-relaxed text-cap-text-muted">
          « Payé » déduit le montant du solde. Si le paiement y figure déjà, enregistre-le depuis{' '}
          <Link href="/charges" className="font-medium text-cap-primary-text underline">Charges</Link> ou{' '}
          <Link href="/dettes" className="font-medium text-cap-primary-text underline">Dettes</Link>.
        </p>
      )}
      <ProjectionEventList events={events} today={today} horizon={horizon} onPay={pay} storageBlocked={storageBlocked} />

      {!(summary.emptyBudget && !balanceDate) && (
        <section aria-labelledby="detail-heading" className={surface}>
          <h2 id="detail-heading" className="text-sm font-bold text-cap-text">Détail sur {horizon} jours</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
            <div>
              <dt className="text-cap-text-muted">Solde aujourd&apos;hui</dt>
              <dd className="text-sm font-bold text-cap-text tabular-nums">{formatCurrency(currentBalance)}</dd>
            </div>
            <div>
              <dt className="text-cap-text-muted">Revenus certains</dt>
              <dd className="text-sm font-bold text-cap-success-text tabular-nums">+{formatCurrency(fromCents(confirmedIncome))}</dd>
              {estimatedIncome > 0 && (
                <dd className="text-cap-text-muted">
                  +{formatCurrency(fromCents(estimatedIncome))} incertains, non comptés dans le solde prudent
                </dd>
              )}
            </div>
            <div>
              <dt className="text-cap-text-muted">Charges prévues</dt>
              <dd className="text-sm font-bold text-cap-text tabular-nums">-{formatCurrency(fromCents(totalExpenses))}</dd>
            </div>
            <div>
              <dt className="text-cap-text-muted">Remboursements dettes</dt>
              <dd className="text-sm font-bold text-cap-text tabular-nums">-{formatCurrency(fromCents(totalDebts))}</dd>
            </div>
            {totalEnvelopes > 0 && (
              <div>
                <dt className="text-cap-text-muted">Enveloppes réservées</dt>
                <dd className="text-sm font-bold text-cap-text tabular-nums">-{formatCurrency(fromCents(totalEnvelopes))}</dd>
              </div>
            )}
          </dl>
          <h3 className="mt-4 border-t border-cap-border pt-3 text-xs font-semibold text-cap-text-muted">Étapes</h3>
          <ProjectionTimeline milestones={milestones} />
        </section>
      )}

      <p className="px-2 py-2 text-center text-xs leading-relaxed text-cap-text-muted">
        Cette projection est basée sur tes données actuelles. Les montants marqués
        « incertains » sont approximatifs. Les dates et montants réels peuvent varier.
        Ne prends pas de décision financière importante basée uniquement sur cette projection.
      </p>

      <PaymentUndoToast
        label={paymentFeedback?.event.label}
        paid={Boolean(paymentFeedback?.paid)}
        error={paymentError}
        onUndo={undo}
        undoRef={undoButton}
      />
    </div>
  );
}
