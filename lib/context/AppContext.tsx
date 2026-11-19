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
} from '@/lib/types';
import { calculateBudgetSummary } from '@/lib/budget-calculations';
import { generateAdvice } from '@/lib/advice-engine';
import {
  cancelExpenseOccurrence,
  deserializeBudget,
  emptyBudgetState,
  migrateLegacyBudget,
  readBudgetSnapshot,
  recordPayment,
  serializeBudget,
  writeBudgetSnapshot,
  type AppState,
  type BudgetStorageSnapshot,
  type Payment,
} from '@/lib/budget-state';
import { todayInBrussels } from '@/lib/local-date';
import { fromCents, toCents } from '@/lib/money';
import { createFirstBudget, type FirstBudgetInput } from '@/lib/onboarding';

type RuntimeState = AppState & {
  storageStatus: 'loading' | 'fresh' | 'ready' | 'unreadable' | 'unsaved';
  storageRevision: number;
};

type BudgetPersistence = {
  snapshot: BudgetStorageSnapshot;
  saved: RuntimeState;
  needsMigration: boolean;
};

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
  | { type: 'SET_BALANCE'; payload: { amount: number; today: string } }
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
  | { type: 'RECORD_PAYMENT'; payload: Payment }
  | { type: 'CANCEL_EXPENSE_OCCURRENCE'; payload: { id: string; dueDate: string; today: string } };

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function appReducer(state: RuntimeState, action: AppAction): RuntimeState {
  if (action.type === 'HYDRATE') return action.payload;
  if (state.storageStatus === 'loading') return state;

  // Saisir des données depuis un autre écran démarre également le budget.
  if (state.storageStatus === 'fresh') state = { ...state, storageStatus: 'ready' };

  switch (action.type) {
    case 'SAVE_FAILED':
      return action.revision === state.storageRevision ? { ...state, storageStatus: 'unsaved' } : state;
    case 'SET_BALANCE':
      return {
        ...state,
        currentBalance: fromCents(toCents(action.payload.amount)),
        balanceDate: action.payload.today,
      };
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

export interface AppContextType extends AppState {
  summary: BudgetSummary;
  advice: AdviceItem[];
  today: string;
  storageBlocked: boolean;
  isBudgetLoading: boolean;
  needsOnboarding: boolean;
  canExportBudget: boolean;
  exportBudget: () => string;
  restoreBudget: (budget: AppState) => void;
  finishOnboarding: (input?: FirstBudgetInput) => void;
  setBalance: (amount: number) => void;
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
  cancelExpenseOccurrence: (id: string, dueDate: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, {
    ...emptyBudgetState,
    storageStatus: 'loading',
    storageRevision: 0,
  });
  const persistence = useRef<BudgetPersistence | null>(null);
  const today = useSyncExternalStore(subscribeToCalendar, todayInBrussels, serverDate);

  useEffect(() => {
    let snapshot: BudgetStorageSnapshot | undefined;
    try {
      snapshot = readBudgetSnapshot(localStorage);
      const { current, legacy } = snapshot;
      const budget = current !== null ? deserializeBudget(current)
        : legacy !== null ? migrateLegacyBudget(legacy, emptyBudgetState, todayInBrussels()) : emptyBudgetState;
      const loaded: RuntimeState = {
        ...budget,
        storageStatus: current === null && legacy === null ? 'fresh' : 'ready',
        storageRevision: 0,
      };
      persistence.current = { snapshot, saved: loaded, needsMigration: legacy !== null };
      dispatch({ type: 'HYDRATE', payload: loaded });
    } catch {
      const unavailable: RuntimeState = { ...emptyBudgetState, storageStatus: 'unreadable', storageRevision: 0 };
      persistence.current = snapshot ? { snapshot, saved: unavailable, needsMigration: false } : null;
      dispatch({ type: 'HYDRATE', payload: unavailable });
    }
  }, []);

  useEffect(() => {
    const { storageStatus, storageRevision, ...budget } = state;
    const previous = persistence.current;
    if (storageStatus !== 'ready' || !previous || storageRevision !== previous.saved.storageRevision
      || (state === previous.saved && !previous.needsMigration)) return;

    try {
      const contents = serializeBudget(budget);
      writeBudgetSnapshot(localStorage, previous.snapshot, contents);
      persistence.current = { snapshot: { current: contents, legacy: null }, saved: state, needsMigration: false };
    } catch {
      dispatch({ type: 'SAVE_FAILED', revision: storageRevision });
    }
  }, [state]);

  const { storageStatus, storageRevision, ...budget } = state;
  const canExportBudget = storageStatus === 'fresh' || storageStatus === 'ready' || storageStatus === 'unsaved';

  function exportBudget(): string {
    if (!canExportBudget) throw new Error('Le budget doit être chargé pour être exporté.');
    return serializeBudget(budget);
  }

  function restoreBudget(imported: AppState): void {
    const previous = persistence.current;
    if (!previous || storageStatus === 'loading') throw new Error('Le stockage du navigateur est indisponible.');
    if (storageRevision !== previous.saved.storageRevision) throw new Error('Une restauration est déjà en cours.');

    const contents = serializeBudget(imported);
    writeBudgetSnapshot(localStorage, previous.snapshot, contents);
    const restored: RuntimeState = {
      ...imported,
      storageStatus: 'ready',
      storageRevision: storageRevision + 1,
    };
    // A save queued before restoration must not overwrite the newly imported version.
    persistence.current = { snapshot: { current: contents, legacy: null }, saved: restored, needsMigration: false };
    dispatch({ type: 'HYDRATE', payload: restored });
  }

  function finishOnboarding(input?: FirstBudgetInput): void {
    if (storageStatus !== 'fresh') throw new Error('Un budget existe déjà sur cet appareil.');
    restoreBudget(input ? createFirstBudget(budget, input, today) : budget);
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
    exportBudget,
    restoreBudget,
    finishOnboarding,
    setBalance: (amount) => dispatch({ type: 'SET_BALANCE', payload: { amount, today } }),
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
    cancelExpenseOccurrence: (id, dueDate) => dispatch({ type: 'CANCEL_EXPENSE_OCCURRENCE', payload: { id, dueDate, today } }),
  };

  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
