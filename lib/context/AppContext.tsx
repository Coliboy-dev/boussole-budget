'use client';

import React, { createContext, useContext, useReducer, useEffect, useSyncExternalStore } from 'react';
import type {
  Income,
  Expense,
  Debt,
  ChildExpense,
  Goal,
  MediationFile,
  UserProfile,
  BudgetSummary,
} from '@/lib/types';
import { calculateBudgetSummary } from '@/lib/budget-calculations';
import {
  BUDGET_STORAGE_KEY,
  LEGACY_BUDGET_STORAGE_KEY,
  cancelExpenseOccurrence,
  deserializeBudget,
  migrateLegacyBudget,
  recordPayment,
  serializeBudget,
  type AppState,
  type Payment,
} from '@/lib/budget-state';
import { todayInBrussels } from '@/lib/local-date';
import { fromCents, toCents } from '@/lib/money';
import {
  mockUser,
  mockCurrentBalance,
  mockIncomes,
  mockExpenses,
  mockDebts,
  mockMediationFile,
  mockChildExpenses,
  mockGoals,
  mockDocuments,
} from '@/lib/mock-data';

type RuntimeState = AppState & { storageStatus: 'loading' | 'ready' | 'blocked' };

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

const defaultState: AppState = {
  currentBalance: mockCurrentBalance,
  userProfile: mockUser,
  incomes: mockIncomes,
  expenses: mockExpenses,
  debts: mockDebts,
  childExpenses: mockChildExpenses,
  goals: mockGoals,
  mediationFile: mockMediationFile,
  documents: mockDocuments,
};

type AppAction =
  | { type: 'HYDRATE'; payload: RuntimeState }
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
  | { type: 'CANCEL_EXPENSE_OCCURRENCE'; payload: { id: string; dueDate: string; today: string } }
  | { type: 'RESET_TO_DEMO'; today: string };

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function appReducer(state: RuntimeState, action: AppAction): RuntimeState {
  switch (action.type) {
    case 'HYDRATE':
      return action.payload;
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
      return { ...recordPayment(state, action.payload), storageStatus: state.storageStatus };
    case 'CANCEL_EXPENSE_OCCURRENCE':
      return {
        ...cancelExpenseOccurrence(state, action.payload.id, action.payload.dueDate, action.payload.today),
        storageStatus: state.storageStatus,
      };
    case 'RESET_TO_DEMO':
      return { ...defaultState, balanceDate: action.today, storageStatus: state.storageStatus };
    default:
      return state;
  }
}

export interface AppContextType extends AppState {
  summary: BudgetSummary;
  today: string;
  storageBlocked: boolean;
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
  resetToDemo: () => void;
  recordPayment: (payment: Omit<Payment, 'today'>) => void;
  cancelExpenseOccurrence: (id: string, dueDate: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, { ...defaultState, storageStatus: 'loading' });
  const today = useSyncExternalStore(subscribeToCalendar, todayInBrussels, serverDate);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(BUDGET_STORAGE_KEY);
      const legacy = stored === null ? localStorage.getItem(LEGACY_BUDGET_STORAGE_KEY) : null;
      const budget = stored !== null ? deserializeBudget(stored)
        : legacy !== null ? migrateLegacyBudget(legacy, defaultState, todayInBrussels()) : defaultState;
      dispatch({ type: 'HYDRATE', payload: { ...budget, storageStatus: 'ready' } });
    } catch {
      dispatch({ type: 'HYDRATE', payload: { ...defaultState, storageStatus: 'blocked' } });
    }
  }, []);

  useEffect(() => {
    const { storageStatus, ...budget } = state;
    if (storageStatus !== 'ready') return;

    try {
      localStorage.setItem(BUDGET_STORAGE_KEY, serializeBudget(budget));
    } catch {
      dispatch({ type: 'HYDRATE', payload: { ...state, storageStatus: 'blocked' } });
    }
  }, [state]);

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
    ...state,
    summary,
    today,
    storageBlocked: state.storageStatus === 'blocked',
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
    resetToDemo: () => dispatch({ type: 'RESET_TO_DEMO', today }),
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
