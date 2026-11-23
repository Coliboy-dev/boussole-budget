import { fromCents, toCents } from './money.ts';
import type { ProjectionEvent, ProjectionResult } from './projection.ts';
import type { AvailableBreakdown } from './types.ts';

/**
 * Le vrai disponible expliqué ligne par ligne. Le moteur prend le jour le plus serré de la période : le solde
 * d'aujourd'hui, plus les rentrées certaines, moins les sorties jusqu'à ce jour-là ; puis il retire ce qu'il faut
 * garder (réserve, provisions annuelles, épargne gardée sur le compte). Les rentrées incertaines ne comptent pas.
 * Les lignes retombent exactement, au centime, sur le résultat du moteur.
 */
export function availableBreakdown(currentBalance: number, projection: ProjectionResult, safetyReserve: number): AvailableBreakdown {
  const sums = { income: 0, charges: 0, envelope: 0, goal: 0 };
  for (const { date, amount, type, isEstimated } of projection.events) {
    if (isEstimated || date > projection.lowestDate) continue;
    const cents = toCents(amount);
    if (type === 'income' || type === 'child') sums.income += cents;
    else if (type === 'envelope') sums.envelope -= cents;
    else if (type === 'goal') sums.goal -= cents;
    else sums.charges -= cents;
  }
  const balance = toCents(currentBalance);
  const lowest = balance + sums.income - sums.charges - sums.envelope - sums.goal;
  const reserve = toCents(safetyReserve);
  const provision = toCents(projection.annualProvision);
  const goalSavings = toCents(projection.goalSavings);
  return {
    lowestDate: projection.lowestDate,
    balance: fromCents(balance),
    incomes: fromCents(sums.income),
    charges: fromCents(sums.charges),
    envelopes: fromCents(sums.envelope),
    savingsTransfers: fromCents(sums.goal),
    lowest: fromCents(lowest),
    safetyReserve: fromCents(reserve),
    annualProvision: fromCents(provision),
    goalSavings: fromCents(goalSavings),
    available: fromCents(lowest - reserve - provision - goalSavings),
  };
}

/**
 * Prochaine rentrée certaine de la période : le repère de chacun (paie en début, en milieu ou en fin de mois),
 * sans changer le calcul. Une rentrée en retard ou incertaine n'est pas un repère fiable.
 */
export function nextCertainIncome(events: readonly ProjectionEvent[]): { label: string; amount: number; date: string } | undefined {
  const next = events
    .filter(({ type, isEstimated, isLate, amount }) => (type === 'income') && !isEstimated && !isLate && amount > 0)
    .sort((first, second) => first.date.localeCompare(second.date) || second.amount - first.amount)[0];
  return next && { label: next.label, amount: next.amount, date: next.date };
}
