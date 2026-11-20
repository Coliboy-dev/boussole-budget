import type { ChildExpense, Debt, DocumentItem, Expense, Goal, Income, MediationFile, UserProfile } from './types.ts';
import { assertBudgetState } from './budget-schema.ts';
import { isLocalDate } from './local-date.ts';
import { debtOccurrences, expenseOccurrences, incomeOccurrences, isOpenOccurrence } from './occurrences.ts';
import { fromCents, toCents } from './money.ts';

export const BUDGET_STORAGE_KEY = 'boussole-budget-v2';
export const LEGACY_BUDGET_STORAGE_KEY = 'boussole-budget-v1';
const BUDGET_VERSION = 2;

export interface BudgetStorageSnapshot {
  current: string | null;
  legacy: string | null;
}

export function readBudgetSnapshot(storage: Pick<Storage, 'getItem'>): BudgetStorageSnapshot {
  const current = storage.getItem(BUDGET_STORAGE_KEY);
  const legacy = current === null ? storage.getItem(LEGACY_BUDGET_STORAGE_KEY) : null;
  return { current, legacy };
}

export function writeBudgetSnapshot(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  expected: BudgetStorageSnapshot,
  contents: string,
): void {
  let latest: BudgetStorageSnapshot;
  try {
    latest = readBudgetSnapshot(storage);
  } catch {
    throw new Error('Le stockage du navigateur est indisponible.');
  }
  if (latest.current !== expected.current || latest.legacy !== expected.legacy) {
    throw new Error('Le budget enregistré a changé dans un autre onglet. Recharge la page avant de continuer.');
  }

  try {
    storage.setItem(BUDGET_STORAGE_KEY, contents);
  } catch {
    throw new Error('Impossible d’enregistrer dans ce navigateur. Le budget enregistré est intact.');
  }
}

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

export const emptyBudgetState: AppState = {
  currentBalance: 0,
  userProfile: {
    id: 'local',
    firstName: '',
    situation: 'other',
    hasChildren: false,
    isInMediation: false,
    safetyReserve: 50,
    currency: 'EUR',
  },
  incomes: [],
  expenses: [],
  debts: [],
  childExpenses: [],
  goals: [],
  mediationFile: { status: 'not_started', steps: [], questionsForMediator: [] },
  documents: [],
};

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

export function serializeBudget(state: AppState, lastBackupDate?: string): string {
  assertBudgetState(state, 'euros');
  return JSON.stringify({ version: BUDGET_VERSION, state: convertAmounts(state, toCents), lastBackupDate });
}

function parseBudgetJSON(contents: string): unknown {
  try {
    return JSON.parse(contents.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('Le fichier ne contient pas de JSON valide.');
  }
}

export function deserializeStoredBudget(stored: string): { budget: AppState; lastBackupDate: string | null } {
  const value = parseBudgetJSON(stored);
  if (!value || typeof value !== 'object' || !('version' in value) || !('state' in value)) {
    throw new Error('Ce fichier ne contient pas de sauvegarde Boussole Budget.');
  }
  if (value.version !== BUDGET_VERSION) throw new Error('Cette version de sauvegarde n’est pas prise en charge.');

  assertBudgetState(value.state, 'cents');
  return {
    budget: convertAmounts(value.state, fromCents),
    lastBackupDate: 'lastBackupDate' in value && isLocalDate(value.lastBackupDate) ? value.lastBackupDate : null,
  };
}

export function deserializeBudget(stored: string): AppState {
  return deserializeStoredBudget(stored).budget;
}

export function migrateLegacyBudget(stored: string, defaults: AppState, today: string): AppState {
  const value = parseBudgetJSON(stored);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Budget v1 invalide');
  const legacy = { ...defaults, ...value };
  assertBudgetState(legacy, 'euros');
  const state = convertAmounts(legacy, (amount) => fromCents(toCents(amount)));

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

export interface UnscheduledDebtPayment {
  id: string;
  amount: number;
  today: string;
  balanceIncludesPayment: boolean;
}

export function recordUnscheduledDebtPayment(state: AppState, payment: UnscheduledDebtPayment): AppState {
  const debt = state.debts.find(({ id }) => id === payment.id);
  const amount = toCents(payment.amount);
  if (!debt || debt.status === 'completed' || !Number.isSafeInteger(amount) || amount <= 0) return state;

  const remaining = toCents(debt.remainingAmount) - amount;
  if (remaining < 0) return state;

  return {
    ...state,
    balanceDate: payment.balanceIncludesPayment ? state.balanceDate : payment.today,
    currentBalance: payment.balanceIncludesPayment ? state.currentBalance : fromCents(toCents(state.currentBalance) - amount),
    debts: state.debts.map((item) => item === debt ? {
      ...debt,
      remainingAmount: fromCents(remaining),
      status: remaining === 0 ? 'completed' : debt.status,
    } : item),
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
