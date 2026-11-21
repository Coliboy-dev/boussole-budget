'use client';

import React, { createContext, useContext, useReducer, useEffect, useRef, useSyncExternalStore } from 'react';
import type {
  Income,
  Expense,
  Debt,
  ChildExpense,
  Goal,
  MediationFile,
  UserProfile,
  BudgetSummary,
  AdviceItem,
  Envelope,
  Spending,
} from '@/lib/types';
import { calculateBudgetSummary } from '@/lib/budget-calculations';
import { generateAdvice } from '@/lib/advice-engine';
import {
  LEGACY_BUDGET_STORAGE_KEY,
  cancelExpenseOccurrence,
  deserializeStoredBudget,
  emptyBudgetState,
  migrateLegacyBudget,
  readBudgetSnapshot,
  recordPayment,
  recordUnscheduledDebtPayment,
  serializeBudget,
  writeBudgetSnapshot,
  type AppState,
  type BudgetStorageSnapshot,
  type Payment,
  type UnscheduledDebtPayment,
} from '@/lib/budget-state';
import { todayInBrussels } from '@/lib/local-date';
import { createFirstBudget, type FirstBudgetInput } from '@/lib/onboarding';
import { updateBalance, type SettledOccurrence } from '@/lib/balance-update';
import { canAccessBudget, useBudgetAccess } from '@/lib/budget-access';
import { readBudgetOwner } from '@/lib/account-guard';
import {
  addSpending as insertSpending,
  deleteEnvelope as removeEnvelope,
  deleteSpending as removeSpending,
  envelopesOf,
  replaceExpenseWithEnvelope as replaceExpense,
  spendingsOf,
  updateSpending as editSpending,
  upsertEnvelope,
} from '@/lib/spending';

type SpendingInput = Omit<Spending, 'id' | 'debited' | 'balanceRevision'>;
type SpendingChanges = Partial<Pick<Spending, 'date' | 'amount' | 'category' | 'label'>>;

type RuntimeState = AppState & {
  lastBackupDate: string | null;
  storageStatus: 'loading' | 'fresh' | 'ready' | 'unreadable' | 'unsaved';
  storageRevision: number;
  lastAddedSpendingId?: string;
};

type BudgetPersistence = {
  snapshot: BudgetStorageSnapshot;
  owner: string;
  saved: RuntimeState;
  needsMigration: boolean;
};

type ScheduledPayment = Pick<Payment, 'id' | 'dueDate'> & { type: 'expense' | 'debt' };

function subscribeToCalendar(listener: () => void): () => void {
  const timer = window.setInterval(listener, 60_000);
  window.addEventListener('focus', listener);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', listener);
  };
}

function serverDate(): string {
  return '2026-05-29';
}

type AppAction =
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

function reduceBudget(state: RuntimeState, action: AppAction): RuntimeState {
  if (action.type === 'HYDRATE') return action.payload;
  if (state.storageStatus === 'loading') return state;

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

function appReducer(state: RuntimeState, action: AppAction): RuntimeState {
  const next = reduceBudget(state, action);
  if (next === state || !next.lastAddedSpendingId || action.type === 'ADD_SPENDING' || action.type === 'HYDRATE') return next;
  return { ...next, lastAddedSpendingId: undefined };
}

function splitRuntimeState(state: RuntimeState) {
  const { storageStatus, storageRevision, lastBackupDate, lastAddedSpendingId, ...budget } = state;
  return { storageStatus, storageRevision, lastBackupDate, lastAddedSpendingId, budget };
}

export interface AppContextType extends AppState {
  summary: BudgetSummary;
  advice: AdviceItem[];
  today: string;
  storageBlocked: boolean;
  isBudgetLoading: boolean;
  needsOnboarding: boolean;
  canExportBudget: boolean;
  isCurrentBudget: () => boolean;
  lastBackupDate: string | null;
  exportBudget: () => string;
  recordBackupExport: (date: string) => void;
  restoreBudget: (budget: AppState) => void;
  finishOnboarding: (input?: FirstBudgetInput) => void;
  saveProfileSettings: (profile: Pick<UserProfile, 'firstName' | 'safetyReserve'>) => void;
  clearBudget: () => void;
  /** Solde affiché par la banque ; `settled` liste les échéances qu’il contient déjà. */
  setBalance: (amount: number, settled?: SettledOccurrence[]) => void;
  updateProfile: (data: Partial<UserProfile>) => void;
  addIncome: (income: Omit<Income, 'id'>) => void;
  updateIncome: (id: string, data: Partial<Income>) => void;
  deleteIncome: (id: string) => void;
  addExpense: (expense: Omit<Expense, 'id'>) => void;
  updateExpense: (id: string, data: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  addDebt: (debt: Omit<Debt, 'id'>) => void;
  updateDebt: (id: string, data: Partial<Debt>) => void;
  deleteDebt: (id: string) => void;
  addChildExpense: (expense: Omit<ChildExpense, 'id'>) => void;
  updateChildExpense: (id: string, data: Partial<ChildExpense>) => void;
  deleteChildExpense: (id: string) => void;
  addGoal: (goal: Omit<Goal, 'id'>) => void;
  updateGoal: (id: string, data: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  updateMediation: (data: Partial<MediationFile>) => void;
  recordPayment: (payment: Omit<Payment, 'today'>) => void;
  recordScheduledPayment: (payment: ScheduledPayment) => void;
  recordUnscheduledDebtPayment: (payment: Omit<UnscheduledDebtPayment, 'today'>) => void;
  undoScheduledPayment: () => void;
  lastAddedSpendingId?: string;
  addSpending: (spending: SpendingInput) => string;
  updateSpending: (id: string, changes: SpendingChanges) => void;
  deleteSpending: (id: string) => void;
  undoLastSpending: () => void;
  saveEnvelope: (envelope: Omit<Envelope, 'id'> & { id?: string }) => void;
  deleteEnvelope: (id: string) => void;
  replaceExpenseWithEnvelope: (expenseId: string, envelope: Omit<Envelope, 'id'> & { id?: string }) => void;
  cancelExpenseOccurrence: (id: string, dueDate: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatchInternal] = useReducer(appReducer, {
    ...emptyBudgetState,
    lastBackupDate: null,
    storageStatus: 'loading',
    storageRevision: 0,
  });
  const persistence = useRef<BudgetPersistence | null>(null);
  const scheduledPaymentUndo = useRef<{ before: AppState; after: RuntimeState } | null>(null);
  const today = useSyncExternalStore(subscribeToCalendar, todayInBrussels, serverDate);
  const budgetAccess = useBudgetAccess();

  function dispatch(action: AppAction) {
    if (canAccessBudget() && isCurrentBudget()) dispatchInternal(action);
  }

  function isCurrentBudget(): boolean {
    const saved = persistence.current;
    if (!saved) return false;
    try {
      const current = readBudgetSnapshot(localStorage);
      return current.current === saved.snapshot.current && current.legacy === saved.snapshot.legacy
        && saved.owner === JSON.stringify(readBudgetOwner(localStorage));
    } catch {
      return false;
    }
  }

  useEffect(() => {
    let snapshot: BudgetStorageSnapshot | undefined;
    let owner = '';
    try {
      owner = JSON.stringify(readBudgetOwner(localStorage));
      snapshot = readBudgetSnapshot(localStorage);
      const { current, legacy } = snapshot;
      const { budget, lastBackupDate } = current !== null ? deserializeStoredBudget(current) : {
        budget: legacy !== null ? migrateLegacyBudget(legacy, emptyBudgetState, todayInBrussels()) : emptyBudgetState,
        lastBackupDate: null,
      };
      const loaded: RuntimeState = {
        ...budget,
        lastBackupDate,
        storageStatus: current === null && legacy === null ? 'fresh' : 'ready',
        storageRevision: 0,
      };
      persistence.current = { snapshot, owner, saved: loaded, needsMigration: legacy !== null };
      dispatchInternal({ type: 'HYDRATE', payload: loaded });
    } catch {
      const unavailable: RuntimeState = {
        ...emptyBudgetState, lastBackupDate: null, storageStatus: 'unreadable', storageRevision: 0,
      };
      persistence.current = snapshot ? { snapshot, owner, saved: unavailable, needsMigration: false } : null;
      dispatchInternal({ type: 'HYDRATE', payload: unavailable });
    }
  }, []);

  useEffect(() => {
    const { storageStatus, storageRevision, lastBackupDate, budget } = splitRuntimeState(state);
    const previous = persistence.current;
    if (!budgetAccess || !canAccessBudget() || storageStatus !== 'ready' || !previous || storageRevision !== previous.saved.storageRevision
      || (state === previous.saved && !previous.needsMigration)) return;

    try {
      if (previous.owner !== JSON.stringify(readBudgetOwner(localStorage))) return;
      const contents = serializeBudget(budget, lastBackupDate ?? undefined);
      writeBudgetSnapshot(localStorage, previous.snapshot, contents);
      persistence.current = { snapshot: { current: contents, legacy: null }, owner: previous.owner, saved: state, needsMigration: false };
    } catch {
      dispatchInternal({ type: 'SAVE_FAILED', revision: storageRevision });
    }
  }, [state, budgetAccess]);

  const { storageStatus, storageRevision, lastBackupDate, lastAddedSpendingId, budget } = splitRuntimeState(state);
  const canExportBudget = budgetAccess && (storageStatus === 'fresh' || storageStatus === 'ready' || storageStatus === 'unsaved');

  function exportBudget(): string {
    if (!canExportBudget || !canAccessBudget() || !isCurrentBudget()) {
      throw new Error('Recharge le budget avec le compte auquel il est associé.');
    }
    return serializeBudget(budget);
  }

  function saveBudget(imported: AppState, backupDate = lastBackupDate): RuntimeState {
    if (!canAccessBudget() || !isCurrentBudget()) throw new Error('Ce budget est temporairement protégé.');
    const previous = persistence.current;
    if (!previous || storageStatus === 'loading') throw new Error('Le stockage du navigateur est indisponible.');
    if (storageRevision !== previous.saved.storageRevision) throw new Error('Une restauration est déjà en cours.');

    const contents = serializeBudget(imported, backupDate ?? undefined);
    writeBudgetSnapshot(localStorage, previous.snapshot, contents);
    const restored: RuntimeState = {
      ...imported,
      lastBackupDate: backupDate,
      storageStatus: 'ready',
      storageRevision: storageRevision + 1,
    };
    // A save queued before restoration must not overwrite the newly imported version.
    persistence.current = { snapshot: { current: contents, legacy: null }, owner: previous.owner, saved: restored, needsMigration: false };
    dispatchInternal({ type: 'HYDRATE', payload: restored });
    return restored;
  }

  function recordBackupExport(date: string): void {
    if (storageStatus === 'fresh') return;
    if (storageStatus !== 'ready' || state !== persistence.current?.saved) {
      throw new Error('La date de l’export n’a pas pu être enregistrée sur cet appareil.');
    }
    if (date !== lastBackupDate) saveBudget(budget, date);
  }

  function restoreBudget(imported: AppState): void {
    saveBudget(imported, null);
  }

  function finishOnboarding(input?: FirstBudgetInput): void {
    if (storageStatus !== 'fresh') throw new Error('Un budget existe déjà sur cet appareil.');
    saveBudget(input ? createFirstBudget(budget, input, today) : budget);
  }

  function saveProfileSettings(profile: Pick<UserProfile, 'firstName' | 'safetyReserve'>): void {
    if ((storageStatus !== 'ready' && storageStatus !== 'fresh') || state !== persistence.current?.saved) {
      throw new Error('Le budget doit être chargé avant d’enregistrer les réglages.');
    }
    saveBudget({ ...budget, userProfile: { ...budget.userProfile, ...profile } });
  }

  function clearBudget(): void {
    // Persist the empty budget first so legacy data cannot be re-imported on restart.
    saveBudget(emptyBudgetState, null);
    scheduledPaymentUndo.current = null;
    try {
      localStorage.removeItem(LEGACY_BUDGET_STORAGE_KEY);
    } catch {
      throw new Error('Le budget actif a été effacé, mais le navigateur a conservé l’ancienne copie. Réessaie de l’effacer.');
    }
  }

  function ensureSavedForPayment(): void {
    if (storageStatus !== 'ready' || state !== persistence.current?.saved) {
      throw new Error('Le budget doit être chargé et enregistré avant de saisir un paiement.');
    }
  }

  function recordScheduledPayment(payment: ScheduledPayment): void {
    ensureSavedForPayment();
    const paid = recordPayment(budget, { ...payment, today, balanceIncludesPayment: false });
    if (paid === budget) throw new Error('Cette échéance ne peut plus être marquée comme payée.');

    scheduledPaymentUndo.current = { before: budget, after: saveBudget(paid) };
  }

  function saveUnscheduledDebtPayment(payment: Omit<UnscheduledDebtPayment, 'today'>): void {
    ensureSavedForPayment();
    const paid = recordUnscheduledDebtPayment(budget, { ...payment, today });
    if (paid === budget) throw new Error('Le paiement dépasse le restant dû ou la dette est déjà soldée.');
    saveBudget(paid);
  }

  function undoScheduledPayment(): void {
    const payment = scheduledPaymentUndo.current;
    // An undo can only restore the exact state replaced by this payment.
    if (!payment || state !== payment.after || state !== persistence.current?.saved) {
      throw new Error('Le budget a changé depuis ce paiement. L’annulation n’est plus disponible.');
    }
    saveBudget(payment.before);
    scheduledPaymentUndo.current = null;
  }

  function undoLastSpending(): void {
    if (!lastAddedSpendingId || storageStatus !== 'ready' || state !== persistence.current?.saved) {
      throw new Error('Le budget a changé depuis cet ajout. L’annulation n’est plus disponible.');
    }
    saveBudget(removeSpending(budget, lastAddedSpendingId));
  }

  const summary = calculateBudgetSummary(
    state.currentBalance,
    state.incomes,
    state.expenses,
    state.debts,
    state.childExpenses,
    state.userProfile.safetyReserve,
    state.goals,
    today,
    { envelopes: envelopesOf(state), spendings: spendingsOf(state) },
  );

  const ctx: AppContextType = {
    ...budget,
    summary,
    advice: generateAdvice(summary, state.incomes, state.debts, today),
    today,
    storageBlocked: storageStatus === 'unreadable' || storageStatus === 'unsaved',
    isBudgetLoading: storageStatus === 'loading',
    needsOnboarding: storageStatus === 'fresh',
    canExportBudget,
    isCurrentBudget,
    lastBackupDate,
    exportBudget,
    recordBackupExport,
    restoreBudget,
    finishOnboarding,
    saveProfileSettings,
    clearBudget,
    setBalance: (amount, settled) => dispatch({ type: 'SET_BALANCE', payload: { amount, today, settled } }),
    updateProfile: (data) => dispatch({ type: 'UPDATE_PROFILE', payload: data }),
    addIncome: (income) => dispatch({ type: 'ADD_INCOME', payload: income }),
    updateIncome: (id, data) => dispatch({ type: 'UPDATE_INCOME', payload: { id, data } }),
    deleteIncome: (id) => dispatch({ type: 'DELETE_INCOME', payload: id }),
    addExpense: (expense) => dispatch({ type: 'ADD_EXPENSE', payload: expense }),
    updateExpense: (id, data) => dispatch({ type: 'UPDATE_EXPENSE', payload: { id, data } }),
    deleteExpense: (id) => dispatch({ type: 'DELETE_EXPENSE', payload: id }),
    addDebt: (debt) => dispatch({ type: 'ADD_DEBT', payload: debt }),
    updateDebt: (id, data) => dispatch({ type: 'UPDATE_DEBT', payload: { id, data } }),
    deleteDebt: (id) => dispatch({ type: 'DELETE_DEBT', payload: id }),
    addChildExpense: (expense) => dispatch({ type: 'ADD_CHILD_EXPENSE', payload: expense }),
    updateChildExpense: (id, data) =>
      dispatch({ type: 'UPDATE_CHILD_EXPENSE', payload: { id, data } }),
    deleteChildExpense: (id) => dispatch({ type: 'DELETE_CHILD_EXPENSE', payload: id }),
    addGoal: (goal) => dispatch({ type: 'ADD_GOAL', payload: goal }),
    updateGoal: (id, data) => dispatch({ type: 'UPDATE_GOAL', payload: { id, data } }),
    deleteGoal: (id) => dispatch({ type: 'DELETE_GOAL', payload: id }),
    updateMediation: (data) => dispatch({ type: 'UPDATE_MEDIATION', payload: data }),
    recordPayment: (payment) => dispatch({ type: 'RECORD_PAYMENT', payload: { ...payment, today } }),
    recordScheduledPayment,
    recordUnscheduledDebtPayment: saveUnscheduledDebtPayment,
    undoScheduledPayment,
    lastAddedSpendingId,
    addSpending: (spending) => {
      const id = crypto.randomUUID();
      dispatch({ type: 'ADD_SPENDING', spending: { ...spending, id }, today });
      return id;
    },
    updateSpending: (id, changes) => dispatch({ type: 'UPDATE_SPENDING', id, changes, today }),
    deleteSpending: (id) => dispatch({ type: 'DELETE_SPENDING', id }),
    undoLastSpending,
    saveEnvelope: (envelope) => dispatch({
      type: 'UPSERT_ENVELOPE', envelope: { ...envelope, id: envelope.id ?? crypto.randomUUID() },
    }),
    deleteEnvelope: (id) => dispatch({ type: 'DELETE_ENVELOPE', id }),
    replaceExpenseWithEnvelope: (expenseId, envelope) => dispatch({
      type: 'REPLACE_EXPENSE_WITH_ENVELOPE', expenseId, envelope: { ...envelope, id: envelope.id ?? crypto.randomUUID() },
    }),
    cancelExpenseOccurrence: (id, dueDate) => dispatch({ type: 'CANCEL_EXPENSE_OCCURRENCE', payload: { id, dueDate, today } }),
  };

  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
