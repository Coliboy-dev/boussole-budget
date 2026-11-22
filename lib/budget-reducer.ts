import type { ChildExpense, Debt, Envelope, Expense, Goal, Income, MediationFile, Spending, UserProfile } from './types.ts';
import { updateBalance, type SettledOccurrence } from './balance-update.ts';
import { cancelExpenseOccurrence, recordPayment, type AppState, type Payment } from './budget-state.ts';
import { mirrorContributions } from './household-contributions.ts';
import {
  addSpending as insertSpending, deleteEnvelope as removeEnvelope, deleteSpending as removeSpending,
  replaceExpenseWithEnvelope as replaceExpense, updateSpending as editSpending, upsertEnvelope,
} from './spending.ts';

export type SpendingInput = Omit<Spending, 'id' | 'debited' | 'balanceRevision'>;
export type SpendingChanges = Partial<Pick<Spending, 'date' | 'amount' | 'category' | 'label'>>;

export type RuntimeState = AppState & {
  lastBackupDate: string | null;
  storageStatus: 'loading' | 'fresh' | 'ready' | 'unreadable' | 'unsaved';
  storageRevision: number;
  lastAddedSpendingId?: string;
};

export type AppAction =
  | { type: 'HYDRATE'; payload: RuntimeState }
  | { type: 'SAVE_FAILED'; revision: number }
  | { type: 'SET_BALANCE'; payload: { amount: number; today: string; settled?: SettledOccurrence[] } }
  | { type: 'UPDATE_PROFILE'; payload: Partial<UserProfile> }
  | { type: 'ADD_INCOME'; payload: Omit<Income, 'id'> }
  | { type: 'UPDATE_INCOME'; payload: { id: string; data: Partial<Income> } }
  | { type: 'DELETE_INCOME'; payload: string }
  | { type: 'ADD_EXPENSE'; payload: Omit<Expense, 'id'> }
  | { type: 'UPDATE_EXPENSE'; payload: { id: string; data: Partial<Expense> } }
  | { type: 'DELETE_EXPENSE'; payload: string }
  | { type: 'SYNC_CONTRIBUTION_MIRRORS'; householdId: string; memberId: string; incomes: Income[] }
  | { type: 'ADD_DEBT'; payload: Omit<Debt, 'id'> }
  | { type: 'UPDATE_DEBT'; payload: { id: string; data: Partial<Debt> } }
  | { type: 'DELETE_DEBT'; payload: string }
  | { type: 'ADD_CHILD_EXPENSE'; payload: Omit<ChildExpense, 'id'> }
  | { type: 'UPDATE_CHILD_EXPENSE'; payload: { id: string; data: Partial<ChildExpense> } }
  | { type: 'DELETE_CHILD_EXPENSE'; payload: string }
  | { type: 'ADD_GOAL'; payload: Omit<Goal, 'id'> }
  | { type: 'UPDATE_GOAL'; payload: { id: string; data: Partial<Goal> } }
  | { type: 'DELETE_GOAL'; payload: string }
  | { type: 'UPDATE_MEDIATION'; payload: Partial<MediationFile> }
  | { type: 'ADD_SPENDING'; spending: SpendingInput & { id: string }; today: string }
  | { type: 'UPDATE_SPENDING'; id: string; changes: SpendingChanges; today: string }
  | { type: 'DELETE_SPENDING'; id: string }
  | { type: 'UPSERT_ENVELOPE'; envelope: Envelope }
  | { type: 'DELETE_ENVELOPE'; id: string }
  | { type: 'REPLACE_EXPENSE_WITH_ENVELOPE'; expenseId: string; envelope: Envelope }
  | { type: 'RECORD_PAYMENT'; payload: Payment }
  | { type: 'CANCEL_EXPENSE_OCCURRENCE'; payload: { id: string; dueDate: string; today: string } };

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function reduceBudget(state: RuntimeState, action: AppAction): RuntimeState {
  if (action.type === 'HYDRATE') return action.payload;
  if (state.storageStatus === 'loading') return state;
  if (action.type === 'SYNC_CONTRIBUTION_MIRRORS') {
    if (state.storageStatus !== 'ready' && state.storageStatus !== 'fresh') return state;
    const next = mirrorContributions(state, action.householdId, action.memberId, action.incomes);
    return next === state ? state : { ...next, storageStatus: 'ready' };
  }

  // Saisir des données depuis un autre écran démarre également le budget.
  if (state.storageStatus === 'fresh') state = { ...state, storageStatus: 'ready' };

  switch (action.type) {
    case 'SAVE_FAILED':
      return action.revision === state.storageRevision ? { ...state, storageStatus: 'unsaved' } : state;
    case 'SET_BALANCE':
      return { ...state, ...updateBalance(state, action.payload) };
    case 'UPDATE_PROFILE':
      return { ...state, userProfile: { ...state.userProfile, ...action.payload } };
    case 'ADD_INCOME':
      return { ...state, incomes: [...state.incomes, { ...action.payload, id: uid() }] };
    case 'UPDATE_INCOME':
      return {
        ...state,
        incomes: state.incomes.map((i) =>
          i.id === action.payload.id ? { ...i, ...action.payload.data } : i
        ),
      };
    case 'DELETE_INCOME':
      return { ...state, incomes: state.incomes.filter((i) => i.id !== action.payload) };
    case 'ADD_EXPENSE':
      return {
        ...state,
        expenses: [...state.expenses, { trackedFrom: action.payload.dueDate, ...action.payload, id: uid() }],
      };
    case 'UPDATE_EXPENSE':
      return {
        ...state,
        expenses: state.expenses.map((e) =>
          e.id === action.payload.id ? {
            ...e,
            ...action.payload.data,
            trackedFrom: action.payload.data.dueDate && action.payload.data.dueDate !== e.dueDate
              ? action.payload.data.dueDate
              : e.trackedFrom,
          } : e
        ),
      };
    case 'DELETE_EXPENSE':
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.payload) };
    case 'ADD_DEBT':
      return {
        ...state,
        debts: [...state.debts, { trackedFrom: action.payload.nextDueDate, ...action.payload, id: uid() }],
      };
    case 'UPDATE_DEBT':
      return {
        ...state,
        debts: state.debts.map((d) =>
          d.id === action.payload.id ? {
            ...d,
            ...action.payload.data,
            trackedFrom: action.payload.data.nextDueDate && action.payload.data.nextDueDate !== d.nextDueDate
              ? action.payload.data.nextDueDate
              : d.trackedFrom,
          } : d
        ),
      };
    case 'DELETE_DEBT':
      return { ...state, debts: state.debts.filter((d) => d.id !== action.payload) };
    case 'ADD_CHILD_EXPENSE':
      return { ...state, childExpenses: [...state.childExpenses, { ...action.payload, id: uid() }] };
    case 'UPDATE_CHILD_EXPENSE':
      return {
        ...state,
        childExpenses: state.childExpenses.map((c) =>
          c.id === action.payload.id ? { ...c, ...action.payload.data } : c
        ),
      };
    case 'DELETE_CHILD_EXPENSE':
      return {
        ...state,
        childExpenses: state.childExpenses.filter((c) => c.id !== action.payload),
      };
    case 'ADD_GOAL':
      return { ...state, goals: [...state.goals, { ...action.payload, id: uid() }] };
    case 'UPDATE_GOAL':
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.payload.id ? { ...g, ...action.payload.data } : g
        ),
      };
    case 'DELETE_GOAL':
      return { ...state, goals: state.goals.filter((g) => g.id !== action.payload) };
    case 'UPDATE_MEDIATION':
      return { ...state, mediationFile: { ...state.mediationFile, ...action.payload } };
    case 'ADD_SPENDING': {
      const next = insertSpending(state, action.spending, action.today);
      return next === state ? state : { ...next, lastAddedSpendingId: action.spending.id };
    }
    case 'UPDATE_SPENDING':
      return editSpending(state, action.id, action.changes, action.today);
    case 'DELETE_SPENDING':
      return removeSpending(state, action.id);
    case 'UPSERT_ENVELOPE':
      return upsertEnvelope(state, action.envelope);
    case 'DELETE_ENVELOPE':
      return removeEnvelope(state, action.id);
    case 'REPLACE_EXPENSE_WITH_ENVELOPE': {
      const { envelope, expenseId } = action;
      const replaced = replaceExpense(state, expenseId, envelope.category, envelope.monthlyAmount);
      if (replaced === state) return state;
      const next = upsertEnvelope(replaced, envelope);
      return next === replaced ? state : next;
    }
    case 'RECORD_PAYMENT':
      return { ...state, ...recordPayment(state, action.payload) };
    case 'CANCEL_EXPENSE_OCCURRENCE':
      return {
        ...state,
        ...cancelExpenseOccurrence(state, action.payload.id, action.payload.dueDate, action.payload.today),
      };
    default:
      return state;
  }
}
