'use client';

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type {
  Income,
  Expense,
  Debt,
  ChildExpense,
  Goal,
  MediationFile,
  UserProfile,
  DocumentItem,
  BudgetSummary,
} from '@/lib/types';
import { calculateBudgetSummary } from '@/lib/budget-calculations';
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

const STORAGE_KEY = 'boussole-budget-v1';

export interface AppState {
  currentBalance: number;
  userProfile: UserProfile;
  incomes: Income[];
  expenses: Expense[];
  debts: Debt[];
  childExpenses: ChildExpense[];
  goals: Goal[];
  mediationFile: MediationFile;
  documents: DocumentItem[];
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
  | { type: 'HYDRATE'; payload: AppState }
  | { type: 'SET_BALANCE'; payload: number }
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
  | { type: 'RESET_TO_DEMO' };

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'HYDRATE':
      return action.payload;
    case 'SET_BALANCE':
      return { ...state, currentBalance: action.payload };
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
      return { ...state, expenses: [...state.expenses, { ...action.payload, id: uid() }] };
    case 'UPDATE_EXPENSE':
      return {
        ...state,
        expenses: state.expenses.map((e) =>
          e.id === action.payload.id ? { ...e, ...action.payload.data } : e
        ),
      };
    case 'DELETE_EXPENSE':
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.payload) };
    case 'ADD_DEBT':
      return { ...state, debts: [...state.debts, { ...action.payload, id: uid() }] };
    case 'UPDATE_DEBT':
      return {
        ...state,
        debts: state.debts.map((d) =>
          d.id === action.payload.id ? { ...d, ...action.payload.data } : d
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
    case 'RESET_TO_DEMO':
      return defaultState;
    default:
      return state;
  }
}

export interface AppContextType extends AppState {
  summary: BudgetSummary;
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
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, defaultState);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AppState>;
        dispatch({ type: 'HYDRATE', payload: { ...defaultState, ...parsed } });
      }
    } catch {
      // localStorage unavailable or corrupt — use defaults
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore write failures
    }
  }, [state]);

  const summary = calculateBudgetSummary(
    state.currentBalance,
    state.incomes,
    state.expenses,
    state.debts,
    state.childExpenses,
    state.userProfile.safetyReserve
  );

  const ctx: AppContextType = {
    ...state,
    summary,
    setBalance: (amount) => dispatch({ type: 'SET_BALANCE', payload: amount }),
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
    resetToDemo: () => dispatch({ type: 'RESET_TO_DEMO' }),
  };

  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
