import { availableBreakdown, nextCertainIncome } from './available-breakdown.ts';
import { goalContributionCents, goalReserveOnAccount, remainingGoalCents, scheduleGoalContributions, type GoalContributionPlan } from './goals.ts';
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
  Schedule,
  Spending,
} from './types.ts';
import { addDays, daysBetween, isLocalDate, parseLocalDate, todayInBrussels } from './local-date.ts';
import { fromCents, monthlyCents, toCents } from './money.ts';
import { forecastOccurrences } from './occurrences.ts';
import { AVAILABLE_HORIZON, buildProjection } from './projection.ts';

export function toMonthlyAmount(amount: number, frequency: Frequency): number {
  return fromCents(monthlyCents(amount, frequency));
}

function activeSchedule(schedule: Schedule, today: string): boolean {
  return !isLocalDate(schedule.endDate) || schedule.endDate >= today;
}

function monthlyIncomeCents(incomes: Income[], today: string): number {
  return incomes.reduce((sum, income) => sum + (activeSchedule(income, today) ? monthlyCents(income.amount, income.frequency) : 0), 0);
}

function expenseMonthlyCents(expense: Expense, today: string): number {
  return expense.isRecurring && activeSchedule(expense, today) ? monthlyCents(expense.amount, expense.frequency) : 0;
}

function monthlyExpenseCents(expenses: Expense[], today: string): number {
  return expenses.reduce((sum, expense) => sum + expenseMonthlyCents(expense, today), 0);
}

/**
 * Charges programmées ramenées au mois, par catégorie, du plus grand au plus petit.
 * Même normalisation que le résumé : la somme est égale à totalMonthlyExpenses.
 */
export function monthlyChargesByCategory(expenses: Expense[], today = todayInBrussels()): { category: Expense['category']; cents: number }[] {
  const totals = new Map<Expense['category'], number>();
  for (const expense of expenses) {
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expenseMonthlyCents(expense, today));
  }
  return [...totals].filter(([, cents]) => cents > 0)
    .map(([category, cents]) => ({ category, cents }))
    .sort((first, second) => second.cents - first.cents || first.category.localeCompare(second.category));
}

function monthlyDebtCents(debts: Debt[]): number {
  return debts.reduce((sum, debt) => {
    if (debt.status === 'completed' || debt.status === 'suspended') return sum;
    return sum + Math.max(0, Math.min(toCents(debt.remainingAmount), toCents(debt.monthlyPayment)));
  }, 0);
}

export function calculateTotalMonthlyIncome(incomes: Income[], today = todayInBrussels()): number {
  return fromCents(monthlyIncomeCents(incomes, today));
}

export function calculateTotalMonthlyExpenses(expenses: Expense[], today = todayInBrussels()): number {
  return fromCents(monthlyExpenseCents(expenses, today));
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

function monthlyGoalContributionCents(goals: readonly GoalContributionPlan[]): number {
  return goals.reduce((sum, goal) => sum + goalContributionCents(goal), 0);
}

export function calculateSavingsCapacity(monthlyMargin: number, goals: readonly GoalContributionPlan[]): number {
  return fromCents(Math.max(0, toCents(monthlyMargin) - monthlyGoalContributionCents(goals)));
}

export function calculateGoalTotals(goals: Goal[]) {
  return {
    saved: fromCents(goals.reduce((sum, goal) => sum + toCents(goal.savedAmount), 0)),
    target: fromCents(goals.reduce((sum, goal) => sum + toCents(goal.targetAmount), 0)),
    monthly: fromCents(monthlyGoalContributionCents(goals)),
  };
}

type GoalPlan = GoalContributionPlan & Pick<Goal, 'targetDate'>;

export type GoalFeasibility =
  | { status: 'realistic'; reason?: never }
  | { status: 'fragile' | 'to_postpone'; reason: string };

export function assessGoalFeasibility(goal: GoalPlan, monthlySavings: number, today = todayInBrussels()): GoalFeasibility {
  const savings = toCents(monthlySavings);
  const contribution = goalContributionCents(goal);
  const remaining = remainingGoalCents(goal);
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
  if (contribution > savings - Math.ceil(savings / 5)) {
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

    const projected = scheduleGoalContributions(goal, today, goal.targetDate)
      .reduce((sum, { amountCents }) => sum + amountCents, 0);
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

/** Le diagnostic d’un objectif tient compte des mensualités des autres, avec la marge signée. */
export function assessBudgetGoals(goals: readonly Goal[], monthlyMargin: number, today: string) {
  const remainingCents = toCents(monthlyMargin) - monthlyGoalContributionCents(goals);
  return goals.map((goal) => ({
    goal,
    feasibility: assessGoalFeasibility(goal, fromCents(remainingCents + goalContributionCents(goal)), today),
  }));
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
  { envelopes = [], spendings = [], balanceDate }: { envelopes?: Envelope[]; spendings?: Spending[]; balanceDate?: string } = {},
): BudgetSummary {
  const totalMonthlyIncome = monthlyIncomeCents(incomes, today);
  const totalMonthlyExpenses = monthlyExpenseCents(expenses, today);
  const totalMonthlyDebts = monthlyDebtCents(debts);
  const totalMonthlyEnvelopes = envelopes.reduce((sum, envelope) => sum + toCents(envelope.monthlyAmount), 0);
  const monthlyMargin = fromCents(monthlyIncomeCents(incomes.filter((income) => income.isConfirmed), today)
    - totalMonthlyExpenses - totalMonthlyDebts - totalMonthlyEnvelopes);

  const forecast = buildProjection(currentBalance, incomes, expenses, debts, childExpenses, safetyReserve, {
    today,
    horizon: AVAILABLE_HORIZON,
    envelopes,
    spendings,
    goals,
  });
  // Budget vide = rien d'encodé du tout. Un solde recopié (même 0 €) ou un objectif compte : sinon la carte afficherait 0 €
  // alors que le détail du calcul donne un autre total (audit C11).
  const empty = currentBalance === 0 && balanceDate === undefined && incomes.length === 0 && expenses.length === 0
    && debts.length === 0 && childExpenses.length === 0 && envelopes.length === 0 && spendings.length === 0 && goals.length === 0;

  return {
    currentBalance,
    totalMonthlyIncome: fromCents(totalMonthlyIncome),
    totalMonthlyExpenses: fromCents(totalMonthlyExpenses),
    totalMonthlyDebts: fromCents(totalMonthlyDebts),
    totalMonthlyEnvelopes: fromCents(totalMonthlyEnvelopes),
    totalMonthlyChildExpenses: 0,
    safetyReserve,
    trueAvailable: empty ? 0 : forecast.available,
    monthlyMargin,
    savingsCapacity: calculateSavingsCapacity(monthlyMargin, goals),
    emptyBudget: empty,
    riskLevel: empty ? 'safe' : forecast.lowestRisk,
    availableForecast: {
      date: forecast.lowestDate,
      balance: forecast.lowestBalance,
      causes: forecast.lowestCauses,
      horizon: AVAILABLE_HORIZON,
      dailyBalances: forecast.dailyBalances,
      annualProvision: forecast.annualProvision,
      goalSavings: forecast.goalSavings,
      goalThisMonth: fromCents(goalReserveOnAccount(goals, today).thisMonthCents),
      breakdown: availableBreakdown(currentBalance, forecast, safetyReserve),
      nextIncome: nextCertainIncome(forecast.events),
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

/** Point final après un texte qui peut déjà finir par une abréviation (« 1 déc. ») : jamais « déc.. ». */
export function endOfSentence(text: string): string {
  return text.endsWith('.') ? '' : '.';
}

export function formatShortDate(dateStr: string): string {
  if (!isLocalDate(dateStr)) return 'Date à vérifier';
  return new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short' }).format(parseLocalDate(dateStr));
}
