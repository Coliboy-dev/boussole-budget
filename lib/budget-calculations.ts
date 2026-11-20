import type {
  Income,
  Expense,
  Debt,
  ChildExpense,
  Goal,
  BudgetSummary,
  Envelope,
  Reminder,
  Frequency,
  GoalStatus,
  MediationStep,
  Spending,
} from './types.ts';
import { addDays, addMonths, daysBetween, isLocalDate, monthsBetween, parseLocalDate, todayInBrussels } from './local-date.ts';
import { fromCents, monthlyCents, toCents } from './money.ts';
import { forecastOccurrences } from './occurrences.ts';
import { AVAILABLE_HORIZON, buildProjection } from './projection.ts';

export function toMonthlyAmount(amount: number, frequency: Frequency): number {
  return fromCents(monthlyCents(amount, frequency));
}

function monthlyIncomeCents(incomes: Income[]): number {
  return incomes.reduce((sum, income) => sum + monthlyCents(income.amount, income.frequency), 0);
}

function monthlyExpenseCents(expenses: Expense[]): number {
  return expenses.reduce(
    (sum, expense) => sum + monthlyCents(expense.amount, expense.isRecurring ? expense.frequency : 'one_time'),
    0,
  );
}

function monthlyDebtCents(debts: Debt[]): number {
  return debts.reduce((sum, debt) => {
    if (debt.status === 'completed' || debt.status === 'suspended') return sum;
    return sum + Math.max(0, Math.min(toCents(debt.remainingAmount), toCents(debt.monthlyPayment)));
  }, 0);
}

export function calculateTotalMonthlyIncome(incomes: Income[]): number {
  return fromCents(monthlyIncomeCents(incomes));
}

export function calculateTotalMonthlyExpenses(expenses: Expense[]): number {
  return fromCents(monthlyExpenseCents(expenses));
}

export function calculateTotalMonthlyDebts(debts: Debt[]): number {
  return fromCents(monthlyDebtCents(debts));
}

export function hasUndatedPayments(expenses: Expense[], debts: Debt[]): boolean {
  return expenses.some((expense) => !expense.isPaid && !isLocalDate(expense.dueDate))
    || debts.some((debt) => debt.monthlyPayment > 0 && debt.remainingAmount > 0
      && debt.status !== 'suspended' && debt.status !== 'completed' && debt.status !== 'late'
      && !isLocalDate(debt.nextDueDate));
}

function monthlyGoalContributionCents(goals: readonly Pick<Goal, 'monthlyContribution'>[]): number {
  return goals.reduce((sum, goal) => sum + toCents(goal.monthlyContribution ?? 0), 0);
}

export function calculateSavingsCapacity(monthlyMargin: number, goals: readonly Pick<Goal, 'monthlyContribution'>[]): number {
  return fromCents(Math.max(0, toCents(monthlyMargin) - monthlyGoalContributionCents(goals)));
}

export function calculateGoalTotals(goals: Goal[]) {
  return {
    saved: fromCents(goals.reduce((sum, goal) => sum + toCents(goal.savedAmount), 0)),
    target: fromCents(goals.reduce((sum, goal) => sum + toCents(goal.targetAmount), 0)),
    monthly: fromCents(monthlyGoalContributionCents(goals)),
  };
}

type GoalPlan = Pick<Goal, 'monthlyContribution' | 'targetAmount' | 'savedAmount' | 'targetDate'>;

export type GoalFeasibility =
  | { status: 'realistic'; reason?: never }
  | { status: 'fragile' | 'to_postpone'; reason: string };

export function assessGoalFeasibility(goal: GoalPlan, monthlySavings: number, today = todayInBrussels()): GoalFeasibility {
  const savings = toCents(monthlySavings);
  const contribution = toCents(goal.monthlyContribution ?? 0);
  const remaining = toCents(goal.targetAmount) - toCents(goal.savedAmount);
  if (remaining <= 0) return { status: 'realistic' };

  if (savings <= 0) {
    return { status: 'to_postpone', reason: 'Ta capacité d’épargne mensuelle est de 0,00 €.' };
  }
  if (contribution <= 0) {
    return {
      status: 'to_postpone',
      reason: `Indique une mise de côté mensuelle pour évaluer cet objectif avec les ${formatCurrency(monthlySavings)} disponibles par mois.`,
    };
  }
  if (contribution > savings * 0.8) {
    const planned = `${formatCurrency(fromCents(contribution))}/mois`;
    const available = `${formatCurrency(monthlySavings)}/mois`;
    return {
      status: 'fragile',
      reason: contribution > savings
        ? `Tu prévois ${planned} pour ${available} disponibles.`
        : `Mettre de côté ${planned} sur ${available} disponibles te laisse peu de marge.`,
    };
  }

  if (isLocalDate(goal.targetDate)) {
    const target = formatDate(goal.targetDate);
    const remainingAmount = formatCurrency(fromCents(remaining));
    if (goal.targetDate < today) {
      return { status: 'fragile', reason: `Il reste ${remainingAmount} à épargner et la date cible du ${target} est passée.` };
    }

    let months = monthsBetween(today, goal.targetDate);
    if (months > 0 && addMonths(today, months) > goal.targetDate) months -= 1;
    const projected = contribution * months;
    if (projected < remaining) {
      return {
        status: 'fragile',
        reason: `Tu mettrais de côté ${formatCurrency(fromCents(projected))} sur les ${remainingAmount} restants d’ici le ${target}.`,
      };
    }
  }

  return { status: 'realistic' };
}

export function calculateGoalFeasibility(goal: GoalPlan, monthlySavings: number, today = todayInBrussels()): GoalStatus {
  return assessGoalFeasibility(goal, monthlySavings, today).status;
}

export function calculateBudgetSummary(
  currentBalance: number,
  incomes: Income[],
  expenses: Expense[],
  debts: Debt[],
  childExpenses: ChildExpense[],
  safetyReserve: number,
  goals: Goal[] = [],
  today = todayInBrussels(),
  { envelopes = [], spendings = [] }: { envelopes?: Envelope[]; spendings?: Spending[] } = {},
): BudgetSummary {
  const totalMonthlyIncome = monthlyIncomeCents(incomes);
  const totalMonthlyExpenses = monthlyExpenseCents(expenses);
  const totalMonthlyDebts = monthlyDebtCents(debts);
  const totalMonthlyEnvelopes = envelopes.reduce((sum, envelope) => sum + toCents(envelope.monthlyAmount), 0);
  const monthlyMargin = monthlyIncomeCents(incomes.filter((income) => income.isConfirmed))
    - totalMonthlyExpenses - totalMonthlyDebts - totalMonthlyEnvelopes;

  const forecast = buildProjection(currentBalance, incomes, expenses, debts, childExpenses, safetyReserve, {
    today,
    horizon: AVAILABLE_HORIZON,
    envelopes,
    spendings,
  });
  const empty = currentBalance === 0 && incomes.length === 0 && expenses.length === 0
    && debts.length === 0 && childExpenses.length === 0 && envelopes.length === 0 && spendings.length === 0;

  return {
    currentBalance,
    totalMonthlyIncome: fromCents(totalMonthlyIncome),
    totalMonthlyExpenses: fromCents(totalMonthlyExpenses),
    totalMonthlyDebts: fromCents(totalMonthlyDebts),
    totalMonthlyEnvelopes: fromCents(totalMonthlyEnvelopes),
    totalMonthlyChildExpenses: 0,
    safetyReserve,
    trueAvailable: empty ? 0 : forecast.available,
    savingsCapacity: calculateSavingsCapacity(fromCents(monthlyMargin), goals),
    emptyBudget: empty,
    riskLevel: empty ? 'safe' : forecast.lowestRisk,
    availableForecast: {
      date: forecast.lowestDate,
      balance: forecast.lowestBalance,
      causes: forecast.lowestCauses,
      horizon: AVAILABLE_HORIZON,
      dailyBalances: forecast.dailyBalances,
      annualProvision: forecast.annualProvision,
      reservedAmount: forecast.reservedAmount,
      optimisticAvailable: empty ? 0 : forecast.optimisticAvailable,
    },
  };
}

export function calculateUncertainIncome(incomes: Income[], today: string, horizon: number) {
  const uncertainIncomes = incomes.filter(({ isConfirmed }) => !isConfirmed);
  const occurrences = forecastOccurrences(uncertainIncomes, [], [], [], today, addDays(today, horizon));

  return {
    count: occurrences.length,
    total: fromCents(occurrences.reduce((sum, { amountCents }) => sum + amountCents, 0)),
  };
}

export function getUpcomingReminders(
  expenses: Expense[],
  debts: Debt[],
  mediationSteps: MediationStep[],
  today = todayInBrussels(),
  horizon = 30,
): Reminder[] {
  const end = addDays(today, horizon);
  const reminders = forecastOccurrences([], expenses, debts, [], today, end).map((occurrence): Reminder => ({
    id: `rem-${occurrence.type}-${occurrence.sourceId}-${occurrence.dueDate}`,
    label: occurrence.label,
    dueDate: occurrence.dueDate,
    amount: fromCents(-occurrence.amountCents),
    type: occurrence.type,
    refId: occurrence.sourceId,
    isUrgent: daysBetween(today, occurrence.dueDate) <= 7,
    isLate: occurrence.status === 'late',
  }));

  for (const step of mediationSteps) {
    if (step.status !== 'pending' || !isLocalDate(step.date) || step.date < today || step.date > end) continue;
    reminders.push({
      id: `rem-med-${step.id}`,
      label: step.title,
      dueDate: step.date,
      type: 'mediation',
      refId: step.id,
      isUrgent: daysBetween(today, step.date) <= 7,
    });
  }

  return reminders.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

const currencyFormatter = new Intl.NumberFormat('fr-BE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

export function formatDate(dateStr: string): string {
  if (!isLocalDate(dateStr)) return 'Date à vérifier';
  return new Intl.DateTimeFormat('fr-BE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseLocalDate(dateStr));
}

export function formatShortDate(dateStr: string): string {
  if (!isLocalDate(dateStr)) return 'Date à vérifier';
  return new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short' }).format(parseLocalDate(dateStr));
}
