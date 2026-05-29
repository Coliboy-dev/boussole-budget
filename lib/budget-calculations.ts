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
} from './types';

// Convert any frequency to monthly equivalent
export function toMonthlyAmount(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case 'monthly':
      return amount;
    case 'weekly':
      return amount * 4.33;
    case 'bi_monthly':
      return amount / 2;
    case 'quarterly':
      return amount / 3;
    case 'annual':
      return amount / 12;
    case 'one_time':
      return 0;
    default:
      return amount;
  }
}

// Total monthly income
export function calculateTotalMonthlyIncome(incomes: Income[]): number {
  return incomes.reduce((sum, income) => {
    return sum + toMonthlyAmount(income.amount, income.frequency);
  }, 0);
}

// Total monthly expenses
export function calculateTotalMonthlyExpenses(expenses: Expense[]): number {
  return expenses.reduce((sum, expense) => {
    return sum + toMonthlyAmount(expense.amount, expense.frequency);
  }, 0);
}

// Total monthly debt payments
export function calculateTotalMonthlyDebts(debts: Debt[]): number {
  return debts.reduce((sum, debt) => {
    if (debt.status === 'completed' || debt.status === 'suspended') return sum;
    return sum + debt.monthlyPayment;
  }, 0);
}

// Total monthly child expenses (estimated monthly from all child expenses)
export function calculateTotalMonthlyChildExpenses(childExpenses: ChildExpense[]): number {
  return childExpenses.reduce((sum, expense) => {
    return sum + expense.paidByUser;
  }, 0);
}

// "Vrai disponible" = currentBalance + expectedIncome - upcomingExpenses - monthlyDebts - childExpenses - safetyReserve
export function calculateTrueAvailable(
  currentBalance: number,
  expectedIncome: number,
  upcomingExpenses: number,
  monthlyDebts: number,
  childExpenses: number,
  safetyReserve: number
): number {
  return currentBalance + expectedIncome - upcomingExpenses - monthlyDebts - childExpenses - safetyReserve;
}

// Risk level based on true available vs expenses
export function calculateRiskLevel(trueAvailable: number, totalMonthlyExpenses: number): 'safe' | 'fragile' | 'danger' {
  if (trueAvailable < 0) return 'danger';
  if (trueAvailable < totalMonthlyExpenses * 0.1) return 'danger';
  if (trueAvailable < totalMonthlyExpenses * 0.2) return 'fragile';
  return 'safe';
}

// Savings capacity
export function calculateSavingsCapacity(trueAvailable: number, goals: Goal[]): number {
  const totalGoalContributions = goals.reduce((sum, goal) => {
    return sum + (goal.monthlyContribution || 0);
  }, 0);

  const capacity = trueAvailable - totalGoalContributions;
  return Math.max(0, capacity);
}

// Goal feasibility
export function calculateGoalFeasibility(goal: Goal, monthlySavings: number): GoalStatus {
  if (monthlySavings <= 0) return 'to_postpone';

  const remaining = goal.targetAmount - goal.savedAmount;
  const monthlyContrib = goal.monthlyContribution || 0;

  if (monthlyContrib <= 0) return 'to_postpone';
  if (monthlyContrib > monthlySavings * 0.8) return 'fragile';

  if (goal.targetDate) {
    const targetDate = new Date(goal.targetDate);
    const today = new Date();
    const monthsLeft = Math.max(0, (targetDate.getFullYear() - today.getFullYear()) * 12 + (targetDate.getMonth() - today.getMonth()));
    const projectedSavings = goal.savedAmount + monthlyContrib * monthsLeft;
    if (projectedSavings < remaining * 0.8) return 'fragile';
  }

  return 'realistic';
}

// Full budget summary
export function calculateBudgetSummary(
  currentBalance: number,
  incomes: Income[],
  expenses: Expense[],
  debts: Debt[],
  childExpenses: ChildExpense[],
  safetyReserve: number
): BudgetSummary {
  const totalMonthlyIncome = calculateTotalMonthlyIncome(incomes);
  const totalMonthlyExpenses = calculateTotalMonthlyExpenses(expenses);
  const totalMonthlyDebts = calculateTotalMonthlyDebts(debts);
  const totalMonthlyChildExpenses = calculateTotalMonthlyChildExpenses(childExpenses);

  const trueAvailable = calculateTrueAvailable(
    currentBalance,
    totalMonthlyIncome,
    totalMonthlyExpenses,
    totalMonthlyDebts,
    totalMonthlyChildExpenses,
    safetyReserve
  );

  const riskLevel = calculateRiskLevel(trueAvailable, totalMonthlyExpenses);

  // Risk score 0-100 (0 = safe, 100 = danger)
  let riskScore: number;
  if (riskLevel === 'safe') {
    riskScore = Math.max(0, 30 - (trueAvailable / totalMonthlyExpenses) * 10);
  } else if (riskLevel === 'fragile') {
    riskScore = 50 + (1 - trueAvailable / totalMonthlyExpenses / 0.2) * 20;
  } else {
    riskScore = Math.min(100, 70 + Math.abs(trueAvailable) / 100 * 5);
  }

  const savingsCapacity = Math.max(0, trueAvailable - 0);

  return {
    currentBalance,
    totalMonthlyIncome,
    totalMonthlyExpenses,
    totalMonthlyDebts,
    totalMonthlyChildExpenses,
    safetyReserve,
    trueAvailable,
    savingsCapacity,
    riskLevel,
    riskScore: Math.round(Math.max(0, Math.min(100, riskScore))),
  };
}

// Upcoming reminders (next 30 days)
export function getUpcomingReminders(
  expenses: Expense[],
  debts: Debt[],
  mediationSteps: MediationStep[]
): Reminder[] {
  const today = new Date();
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);

  const reminders: Reminder[] = [];

  // From expenses
  expenses.forEach((expense) => {
    if (expense.dueDate) {
      const due = new Date(expense.dueDate);
      if (due >= today && due <= in30Days) {
        const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        reminders.push({
          id: `rem-exp-${expense.id}`,
          label: expense.label,
          dueDate: expense.dueDate,
          amount: expense.amount,
          type: 'expense',
          refId: expense.id,
          isUrgent: daysUntil <= 7,
        });
      }
    }
  });

  // From debts
  debts.forEach((debt) => {
    if (debt.nextDueDate && debt.monthlyPayment > 0) {
      const due = new Date(debt.nextDueDate);
      if (due >= today && due <= in30Days) {
        const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        reminders.push({
          id: `rem-debt-${debt.id}`,
          label: `Remboursement ${debt.creditor}`,
          dueDate: debt.nextDueDate,
          amount: debt.monthlyPayment,
          type: 'debt',
          refId: debt.id,
          isUrgent: daysUntil <= 7 || debt.status === 'late',
        });
      }
    }
  });

  // From mediation steps
  mediationSteps.forEach((step) => {
    if (step.status === 'pending') {
      const due = new Date(step.date);
      if (due >= today && due <= in30Days) {
        const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        reminders.push({
          id: `rem-med-${step.id}`,
          label: step.title,
          dueDate: step.date,
          type: 'mediation',
          refId: step.id,
          isUrgent: daysUntil <= 7,
        });
      }
    }
  });

  // Sort by due date, urgent first
  return reminders.sort((a, b) => {
    if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
}

// Format currency (Belgian/French format)
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Format date in French locale
export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-BE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dateStr));
}

// Format short date
export function formatShortDate(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-BE', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(dateStr));
}
