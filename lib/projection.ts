import { annualProvisionsCents } from './annual-provisions.ts';
import { goalOccurrences, goalSavingsOnAccountCents, type GoalOccurrence } from './goals.ts';
import { envelopeOccurrences, type EnvelopeOccurrence } from './envelopes.ts';
import type { Income, Expense, Debt, ChildExpense, DailyBalance, Envelope, Goal, Spending } from './types.ts';
import { addDays, daysBetween, todayInBrussels } from './local-date.ts';
import { fromCents, toCents } from './money.ts';
import { forecastOccurrences, type Occurrence } from './occurrences.ts';

type RiskLevel = 'safe' | 'fragile' | 'danger';
type ProjectedOccurrence = Occurrence | EnvelopeOccurrence | GoalOccurrence;

export interface ProjectionEvent {
  id: string;
  sourceId: string;
  date: string;
  dueDate: string;
  label: string;
  amount: number;
  type: ProjectedOccurrence['type'];
  isEstimated: boolean;
  isLate: boolean;
}

export interface ProjectionMilestone extends DailyBalance {
  label: string;
  daysFromNow: number;
  riskLevel: RiskLevel;
}

export interface ProjectionResult {
  startDate: string;
  milestones: ProjectionMilestone[];
  dailyBalances: DailyBalance[];
  events: ProjectionEvent[];
  lowestBalance: number;
  lowestDate: string;
  lowestDaysFromNow: number;
  lowestCauses: string[];
  lowestRisk: RiskLevel;
  optimisticLowestBalance: number;
  annualProvision: number;
  /** Épargne des objectifs gardée sur le compte courant (déjà épargnée + mise de côté du mois), comprise dans la réserve. */
  goalSavings: number;
  reservedAmount: number;
  available: number;
  optimisticAvailable: number;
  safetyWarning: boolean;
}

interface ProjectionOptions {
  today?: string;
  horizon?: number;
  envelopes?: Envelope[];
  spendings?: Spending[];
  goals?: Goal[];
}

export const AVAILABLE_HORIZON = 35;

function riskFor(balance: number, reserve: number): RiskLevel {
  if (balance < 0) return 'danger';
  if (balance < reserve) return 'fragile';
  return 'safe';
}

export function buildProjection(
  currentBalance: number,
  incomes: Income[],
  expenses: Expense[],
  debts: Debt[],
  childExpenses: ChildExpense[],
  safetyReserve: number,
  { today = todayInBrussels(), horizon = 30, envelopes = [], spendings = [], goals = [] }: ProjectionOptions = {},
): ProjectionResult {
  const end = addDays(today, horizon);
  const occurrences = [
    ...forecastOccurrences(incomes, expenses, debts, childExpenses, today, end),
    ...envelopeOccurrences(envelopes, spendings, today, end),
    ...goalOccurrences(goals, today, end),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amountCents - a.amountCents);

  const byDate = new Map<string, ProjectedOccurrence[]>();
  const events = occurrences.map((occurrence): ProjectionEvent => {
    const { dueDate, amountCents, sourceId, type, label, isEstimated } = occurrence;
    const isLate = occurrence.status === 'late';
    const date = isLate ? today : dueDate;
    const day = byDate.get(date) ?? [];
    day.push(occurrence);
    byDate.set(date, day);

    return { id: `${type}-${sourceId}-${dueDate}`, sourceId, date, dueDate, label, amount: fromCents(amountCents), type, isEstimated, isLate };
  });

  const annualProvision = annualProvisionsCents(expenses, today, end);
  const goalSavings = goalSavingsOnAccountCents(goals, today);
  const reserve = toCents(safetyReserve) + annualProvision + goalSavings;
  let balance = toCents(currentBalance);
  let optimisticBalance = balance;
  let lowest = Infinity;
  let optimisticLowest = Infinity;
  let lowestDate = today;
  const dailyBalances: DailyBalance[] = [];
  const milestones: ProjectionMilestone[] = [];
  const milestoneDays = new Set([0, 7, 15, 30, horizon]);

  for (let offset = 0; offset <= horizon; offset++) {
    const date = addDays(today, offset);
    for (const occurrence of byDate.get(date) ?? []) {
      optimisticBalance += occurrence.amountCents;
      if (!occurrence.isEstimated) balance += occurrence.amountCents;
    }

    if (balance < lowest) {
      lowest = balance;
      lowestDate = date;
    }
    optimisticLowest = Math.min(optimisticLowest, optimisticBalance);
    const point = { date, balance: fromCents(balance) };
    dailyBalances.push(point);

    if (milestoneDays.has(offset)) {
      milestones.push({
        ...point,
        label: offset === 0 ? "Aujourd'hui" : `Dans ${offset} jours`,
        daysFromNow: offset,
        riskLevel: riskFor(balance, reserve),
      });
    }
  }

  const lowestCauses = (byDate.get(lowestDate) ?? [])
    .filter((occurrence) => occurrence.amountCents < 0)
    .sort((a, b) => a.amountCents - b.amountCents)
    .map((occurrence) => occurrence.label);

  return {
    startDate: today,
    milestones,
    dailyBalances,
    events,
    lowestBalance: fromCents(lowest),
    lowestDate,
    lowestDaysFromNow: daysBetween(today, lowestDate),
    lowestCauses,
    lowestRisk: riskFor(lowest, reserve),
    optimisticLowestBalance: fromCents(optimisticLowest),
    annualProvision: fromCents(annualProvision),
    goalSavings: fromCents(goalSavings),
    reservedAmount: fromCents(reserve),
    available: fromCents(lowest - reserve),
    optimisticAvailable: fromCents(optimisticLowest - reserve),
    safetyWarning: lowest < reserve,
  };
}
