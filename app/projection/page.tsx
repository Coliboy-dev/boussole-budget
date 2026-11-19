'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { AVAILABLE_HORIZON, buildProjection } from '@/lib/projection';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import { fromCents, toCents } from '@/lib/money';
import ProjectionTimeline from '@/components/projection/ProjectionTimeline';
import ProjectionEventList from '@/components/projection/ProjectionEventList';
import Card from '@/components/ui/Card';
import AlertBanner from '@/components/ui/AlertBanner';

const HORIZONS = [7, 15, 30, AVAILABLE_HORIZON] as const;
type Horizon = (typeof HORIZONS)[number];

export default function ProjectionPage() {
  const { currentBalance, incomes, expenses, debts, childExpenses, userProfile, today } = useApp();
  const [horizon, setHorizon] = useState<Horizon>(AVAILABLE_HORIZON);

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

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">📅 Ma projection</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Évolution de ta situation financière dans le temps
        </p>
      </div>

      {/* Safety warning */}
      {projection.safetyWarning && (
        <AlertBanner variant="warning" title="Attention — solde bas prévu">
          Ton solde pourrait descendre sous{' '}
          <strong>{formatCurrency(userProfile.safetyReserve)}</strong> aux alentours du{' '}
          <strong>
            {formatShortDate(projection.lowestDate)}
          </strong>
          . Garde ce montant de côté si possible.
        </AlertBanner>
      )}

      {/* Horizon selector */}
      <Card padding="sm">
        <p className="text-xs font-semibold text-gray-500 mb-2 px-1">Horizon de projection</p>
        <div className="flex gap-2">
          {HORIZONS.map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${
                horizon === h
                  ? 'bg-teal-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {h} jours
            </button>
          ))}
        </div>
      </Card>

      {/* Visual timeline */}
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
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
          Solde prudent dans {horizon} jours
        </p>
        <p
          className={`text-3xl font-bold mb-2 ${
            endRisk === 'danger'
              ? 'text-red-700'
              : endRisk === 'fragile'
                ? 'text-amber-700'
                : 'text-green-700'
          }`}
        >
          {formatCurrency(endBalance)}
        </p>

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-2 text-xs border-t border-gray-200 pt-3">
          <div>
            <p className="text-gray-400">Solde aujourd&apos;hui</p>
            <p className="font-bold text-gray-700">{formatCurrency(currentBalance)}</p>
          </div>
          <div>
            <p className="text-gray-400">Revenus certains</p>
            <p className="font-bold text-green-600">
              +{formatCurrency(fromCents(confirmedIncome))}
              {estimatedIncome > 0 && (
                <span className="text-gray-400 font-normal ml-1">
                  (+{formatCurrency(fromCents(estimatedIncome))} incertains)
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-gray-400">Charges prévues</p>
            <p className="font-bold text-gray-600">-{formatCurrency(fromCents(totalExpenses))}</p>
          </div>
          <div>
            <p className="text-gray-400">Remboursements dettes</p>
            <p className="font-bold text-amber-600">-{formatCurrency(fromCents(totalDebts))}</p>
          </div>
        </div>
      </Card>

      {/* Events list */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 px-1">
          Événements dans les {horizon} prochains jours
        </h2>
        <ProjectionEventList events={events} today={projection.startDate} />
      </div>

      {/* Disclaimer */}
      <Card className="bg-gray-50 border-dashed border-gray-200">
        <p className="text-xs text-gray-400 text-center leading-relaxed">
          📊 Cette projection est basée sur tes données actuelles. Les montants marqués
          &quot;estimés&quot; sont approximatifs. Les dates et montants réels peuvent varier.
          Ne prends pas de décision financière importante basée uniquement sur cette projection.
        </p>
      </Card>
    </div>
  );
}
