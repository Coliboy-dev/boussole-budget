import type {
  Income,
  Expense,
  Debt,
  ChildExpense,
  Goal,
  BudgetSummary,
  Reminder,
  Frequency,
  GoalStatus,
  MediationStep,
} from './types.ts';
import { addDays, daysBetween, isLocalDate, monthsBetween, parseLocalDate, todayInBrussels } from './local-date.ts';
import { fromCents, toCents } from './money.ts';
import { forecastOccurrences } from './occurrences.ts';
import { AVAILABLE_HORIZON, buildProjection } from './projection.ts';

function monthlyCents(amount: number, frequency: Frequency): number {
  const cents = toCents(amount);
  switch (frequency) {
    case 'weekly':
      return Math.round(cents * 52 / 12);
    case 'bi_monthly':
      return Math.round(cents / 2);
    case 'quarterly':
      return Math.round(cents / 3);
    case 'annual':
      return Math.round(cents / 12);
    case 'one_time':
      return 0;
    default:
      return cents;
  }
}

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

export function calculateSavingsCapacity(monthlyMargin: number, goals: Goal[]): number {
  const provisions = goals.reduce((sum, goal) => sum + toCents(goal.monthlyContribution ?? 0), 0);
  return fromCents(Math.max(0, toCents(monthlyMargin) - provisions));
}

export function calculateGoalFeasibility(goal: Goal, monthlySavings: number): GoalStatus {
  const savings = toCents(monthlySavings);
  const contribution = toCents(goal.monthlyContribution ?? 0);
  if (savings <= 0 || contribution <= 0) return 'to_postpone';
  if (contribution > savings * 0.8) return 'fragile';

  if (isLocalDate(goal.targetDate)) {
    const months = Math.max(0, monthsBetween(todayInBrussels(), goal.targetDate));
    const saved = toCents(goal.savedAmount);
    const remaining = toCents(goal.targetAmount) - saved;
    if (saved + contribution * months < remaining * 0.8) return 'fragile';
  }

  return 'realistic';
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
): BudgetSummary {
  const totalMonthlyIncome = monthlyIncomeCents(incomes);
  const totalMonthlyExpenses = monthlyExpenseCents(expenses);
  const totalMonthlyDebts = monthlyDebtCents(debts);
  const monthlyMargin = monthlyIncomeCents(incomes.filter((income) => income.isConfirmed))
    - totalMonthlyExpenses - totalMonthlyDebts;

  const forecast = buildProjection(currentBalance, incomes, expenses, debts, childExpenses, safetyReserve, {
    today,
    horizon: AVAILABLE_HORIZON,
  });
  const reserve = toCents(safetyReserve);
  const empty = currentBalance === 0 && incomes.length === 0 && expenses.length === 0
    && debts.length === 0 && childExpenses.length === 0;
  const trueAvailable = empty ? 0 : fromCents(toCents(forecast.lowestBalance) - reserve);

  return {
    currentBalance,
    totalMonthlyIncome: fromCents(totalMonthlyIncome),
    totalMonthlyExpenses: fromCents(totalMonthlyExpenses),
    totalMonthlyDebts: fromCents(totalMonthlyDebts),
    totalMonthlyChildExpenses: 0,
    safetyReserve,
    trueAvailable,
    savingsCapacity: calculateSavingsCapacity(fromCents(monthlyMargin), goals),
    emptyBudget: empty,
    riskLevel: empty ? 'safe' : forecast.lowestRisk,
    availableForecast: {
      date: forecast.lowestDate,
      balance: forecast.lowestBalance,
      causes: forecast.lowestCauses,
      horizon: AVAILABLE_HORIZON,
      dailyBalances: forecast.dailyBalances,
      optimisticAvailable: empty ? 0 : fromCents(toCents(forecast.optimisticLowestBalance) - reserve),
    },
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
