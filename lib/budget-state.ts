import type { ChildExpense, Debt, DocumentItem, Expense, Goal, Income, MediationFile, UserProfile } from './types.ts';
import { isLocalDate } from './local-date.ts';
import { debtOccurrences, expenseOccurrences, incomeOccurrences, isOpenOccurrence } from './occurrences.ts';
import { fromCents, toCents } from './money.ts';

export const BUDGET_STORAGE_KEY = 'boussole-budget-v2';
export const LEGACY_BUDGET_STORAGE_KEY = 'boussole-budget-v1';

export interface AppState {
  currentBalance: number;
  balanceDate?: string;
  userProfile: UserProfile;
  incomes: Income[];
  expenses: Expense[];
  debts: Debt[];
  childExpenses: ChildExpense[];
  goals: Goal[];
  mediationFile: MediationFile;
  documents: DocumentItem[];
}

function convertAmounts(state: AppState, convert: (amount: number) => number): AppState {
  const plan = state.mediationFile.proposedPlan;
  return {
    ...state,
    currentBalance: convert(state.currentBalance),
    userProfile: { ...state.userProfile, safetyReserve: convert(state.userProfile.safetyReserve) },
    incomes: state.incomes.map((income) => ({ ...income, amount: convert(income.amount) })),
    expenses: state.expenses.map((expense) => ({ ...expense, amount: convert(expense.amount) })),
    debts: state.debts.map((debt) => ({
      ...debt,
      initialAmount: convert(debt.initialAmount),
      remainingAmount: convert(debt.remainingAmount),
      monthlyPayment: convert(debt.monthlyPayment),
    })),
    childExpenses: state.childExpenses.map((expense) => ({
      ...expense,
      totalAmount: convert(expense.totalAmount),
      paidByUser: convert(expense.paidByUser),
      shareAmount: convert(expense.shareAmount),
    })),
    goals: state.goals.map((goal) => ({
      ...goal,
      targetAmount: convert(goal.targetAmount),
      savedAmount: convert(goal.savedAmount),
      weeklyContribution: goal.weeklyContribution === undefined ? undefined : convert(goal.weeklyContribution),
      monthlyContribution: goal.monthlyContribution === undefined ? undefined : convert(goal.monthlyContribution),
    })),
    mediationFile: {
      ...state.mediationFile,
      proposedPlan: plan && {
        ...plan,
        totalAmount: convert(plan.totalAmount),
        monthlyPayment: convert(plan.monthlyPayment),
      },
    },
  };
}

export function serializeBudget(state: AppState): string {
  return JSON.stringify({ version: 2, state: convertAmounts(state, checkedCents) });
}

function checkedCents(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error('Montant invalide');
  const cents = toCents(amount);
  if (!Number.isSafeInteger(cents)) throw new Error('Montant en centimes invalide');
  return cents;
}

export function deserializeBudget(stored: string): AppState {
  const value = JSON.parse(stored) as { version?: unknown; state?: AppState } | null;
  if (value?.version !== 2 || !value.state) throw new Error('Version de budget non reconnue');

  return convertAmounts(value.state, (amount) => {
    if (!Number.isSafeInteger(amount)) throw new Error('Montant en centimes invalide');
    return fromCents(amount);
  });
}

export function migrateLegacyBudget(stored: string, defaults: AppState, today: string): AppState {
  const value = JSON.parse(stored) as Partial<AppState> | null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Budget v1 invalide');
  const state = convertAmounts({ ...defaults, ...value }, (amount) => fromCents(checkedCents(amount)));

  return {
    ...state,
    expenses: state.expenses.map((expense) => {
      const dueDate = expense.dueDate;
      const migrated = expense.isPaid && isLocalDate(dueDate) ? {
        ...expense,
        isPaid: false,
        occurrenceStatuses: { ...expense.occurrenceStatuses, [dueDate]: 'paid' as const },
      } : expense;

      // An old recurring date is a calendar anchor. V1 did not track earlier cycles.
      if (!expense.isRecurring || expense.frequency === 'one_time') return migrated;
      const knownLate = expenseOccurrences(migrated, today, today).find((item) => item.status === 'late');
      return { ...migrated, trackedFrom: knownLate?.dueDate ?? today };
    }),
    debts: state.debts.map((debt) => {
      if (debt.status === 'late') return debt;
      const knownLate = debtOccurrences(debt, today, today).find((item) => item.status === 'late');
      return { ...debt, trackedFrom: knownLate?.dueDate ?? today };
    }),
  };
}

export interface Payment {
  type: 'income' | 'expense' | 'debt';
  id: string;
  dueDate: string;
  today: string;
  balanceIncludesPayment: boolean;
}

export function recordPayment(state: AppState, payment: Payment): AppState {
  const { type, id, dueDate, today, balanceIncludesPayment } = payment;
  const through = dueDate > today ? dueDate : today;
  const income = type === 'income' ? state.incomes.find((item) => item.id === id) : undefined;
  const expense = type === 'expense' ? state.expenses.find((item) => item.id === id) : undefined;
  const debt = type === 'debt' ? state.debts.find((item) => item.id === id) : undefined;
  const occurrences = income ? incomeOccurrences(income, today, through)
    : expense ? expenseOccurrences(expense, today, through) : debt ? debtOccurrences(debt, today, through) : [];
  const occurrence = occurrences.find((item) => item.dueDate === dueDate && isOpenOccurrence(item));
  if (!occurrence || !Number.isSafeInteger(occurrence.amountCents) || occurrence.amountCents === 0
    || (type === 'income') !== (occurrence.amountCents > 0)) return state;

  const balanceCents = toCents(state.currentBalance);
  return {
    ...state,
    balanceDate: balanceIncludesPayment ? state.balanceDate : today,
    currentBalance: balanceIncludesPayment ? state.currentBalance : fromCents(balanceCents + occurrence.amountCents),
    incomes: income ? state.incomes.map((item) => item.id === id
      ? { ...item, occurrenceStatuses: { ...item.occurrenceStatuses, [dueDate]: 'paid' } }
      : item) : state.incomes,
    expenses: expense ? state.expenses.map((item) => item.id === id
      ? { ...item, occurrenceStatuses: { ...item.occurrenceStatuses, [dueDate]: 'paid' } }
      : item) : state.expenses,
    debts: debt ? state.debts.map((item) => {
      if (item.id !== id) return item;
      const remainingCents = toCents(item.remainingAmount) + occurrence.amountCents;
      const updated: Debt = {
        ...item,
        remainingAmount: fromCents(remainingCents),
        status: remainingCents === 0 ? 'completed' : item.status,
        occurrenceStatuses: { ...item.occurrenceStatuses, [dueDate]: 'paid' },
      };
      if (updated.status === 'late'
        && !debtOccurrences(updated, today, today).some((item) => item.status === 'late')) {
        updated.status = 'to_pay';
      }
      return updated;
    }) : state.debts,
  };
}

export function cancelExpenseOccurrence(state: AppState, id: string, dueDate: string, today: string): AppState {
  const expense = state.expenses.find((item) => item.id === id);
  const through = dueDate > today ? dueDate : today;
  if (!expense || !expenseOccurrences(expense, today, through)
    .some((item) => item.dueDate === dueDate && isOpenOccurrence(item))) return state;

  return {
    ...state,
    expenses: state.expenses.map((item) => item.id === id
      ? { ...item, occurrenceStatuses: { ...item.occurrenceStatuses, [dueDate]: 'cancelled' } }
      : item),
  };
}
