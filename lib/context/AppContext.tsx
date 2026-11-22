'use client';

import React, { createContext, useCallback, useContext, useReducer, useEffect, useRef, useSyncExternalStore } from 'react';
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
} from '@/lib/types';
import { calculateBudgetSummary } from '@/lib/budget-calculations';
import { generateAdvice } from '@/lib/advice-engine';
import {
  LEGACY_BUDGET_STORAGE_KEY,
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
import type { SettledOccurrence } from '@/lib/balance-update';
import { canAccessBudget, useBudgetAccess } from '@/lib/budget-access';
import { readBudgetOwner, readStoredSessionUserId } from '@/lib/account-guard';
import { deleteSpending as removeSpending, envelopesOf, spendingsOf } from '@/lib/spending';
import { reduceBudget, type AppAction, type RuntimeState, type SpendingChanges, type SpendingInput } from '@/lib/budget-reducer';

type BudgetPersistence = {
  snapshot: BudgetStorageSnapshot;
  owner: string;
  saved: RuntimeState;
  needsMigration: boolean;
};

function isSavedBudgetCurrent(saved: BudgetPersistence | null): boolean {
  if (!saved) return false;
  try {
    const current = readBudgetSnapshot(localStorage);
    return current.current === saved.snapshot.current && current.legacy === saved.snapshot.legacy
      && saved.owner === JSON.stringify(readBudgetOwner(localStorage));
  } catch {
    return false;
  }
}

export type ScheduledPayment = Pick<Payment, 'id' | 'dueDate'> & { type: 'expense' | 'debt' };

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
  reloadStoredBudget: () => void;
  lastBackupDate: string | null;
  exportBudget: () => string;
  recordBackupExport: (date: string) => void;
  restoreBudget: (budget: AppState) => void;
  finishOnboarding: (input?: FirstBudgetInput, accountId?: string) => AppState;
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
  syncContributionMirrors: (userId: string, householdId: string, memberId: string, incomes: Income[]) => void;
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

type BudgetCommands = Pick<AppContextType,
  'setBalance' | 'updateProfile' | 'addIncome' | 'updateIncome' | 'deleteIncome' | 'addExpense' | 'updateExpense' | 'deleteExpense' | 'addDebt' | 'updateDebt' | 'deleteDebt' | 'addChildExpense' | 'updateChildExpense' | 'deleteChildExpense' | 'addGoal' | 'updateGoal' | 'deleteGoal' | 'updateMediation' | 'recordPayment' | 'addSpending' | 'updateSpending' | 'deleteSpending' | 'saveEnvelope' | 'deleteEnvelope' | 'replaceExpenseWithEnvelope' | 'cancelExpenseOccurrence'
>;

export function budgetCommands(dispatch: (action: AppAction) => void, today: string): BudgetCommands {
  return {
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
    addSpending: (spending) => {
      const id = crypto.randomUUID();
      dispatch({ type: 'ADD_SPENDING', spending: { ...spending, id }, today });
      return id;
    },
    updateSpending: (id, changes) => dispatch({ type: 'UPDATE_SPENDING', id, changes, today }),
    deleteSpending: (id) => dispatch({ type: 'DELETE_SPENDING', id }),
    saveEnvelope: (envelope) => dispatch({
      type: 'UPSERT_ENVELOPE', envelope: { ...envelope, id: envelope.id ?? crypto.randomUUID() },
    }),
    deleteEnvelope: (id) => dispatch({ type: 'DELETE_ENVELOPE', id }),
    replaceExpenseWithEnvelope: (expenseId, envelope) => dispatch({
      type: 'REPLACE_EXPENSE_WITH_ENVELOPE', expenseId, envelope: { ...envelope, id: envelope.id ?? crypto.randomUUID() },
    }),
    cancelExpenseOccurrence: (id, dueDate) => dispatch({ type: 'CANCEL_EXPENSE_OCCURRENCE', payload: { id, dueDate, today } }),
  };
}

export const AppContext = createContext<AppContextType | null>(null);

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

  function isCurrentBudget() {
    return isSavedBudgetCurrent(persistence.current);
  }

  const syncContributionMirrors = useCallback<AppContextType['syncContributionMirrors']>((userId, householdId, memberId, incomes) => {
    if (!canAccessBudget() || !isSavedBudgetCurrent(persistence.current)) return;
    const owner = readBudgetOwner(localStorage);
    if (owner.type !== 'account' || owner.userId !== userId || readStoredSessionUserId(localStorage) !== userId) return;
    dispatchInternal({ type: 'SYNC_CONTRIBUTION_MIRRORS', householdId, memberId, incomes });
  }, []);

  const reloadStoredBudget = useCallback(() => {
    scheduledPaymentUndo.current = null;
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

  useEffect(reloadStoredBudget, [reloadStoredBudget]);

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
    return persistBudget(imported, backupDate);
  }

  function persistBudget(imported: AppState, backupDate: string | null, owner?: string): RuntimeState {
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
    persistence.current = { snapshot: { current: contents, legacy: null }, owner: owner ?? previous.owner, saved: restored, needsMigration: false };
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

  function finishOnboarding(input?: FirstBudgetInput, accountId?: string): AppState {
    if (storageStatus !== 'fresh') throw new Error('Un budget existe déjà sur cet appareil.');
    const firstBudget = input ? createFirstBudget(budget, input, today) : budget;
    if (!accountId) return splitRuntimeState(saveBudget(firstBudget)).budget;

    const owner = readBudgetOwner(localStorage);
    const previous = persistence.current;
    if (!input || owner.type !== 'transition' || owner.userId !== accountId
      || readStoredSessionUserId(localStorage) !== accountId || !previous
      || previous.snapshot.current !== null || previous.snapshot.legacy !== null) {
      throw new Error('Le compte ou le budget a changé. Recommence depuis ton compte.');
    }
    return splitRuntimeState(persistBudget(firstBudget, null, JSON.stringify({ type: 'account', userId: accountId }))).budget;
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
    reloadStoredBudget,
    lastBackupDate,
    exportBudget,
    recordBackupExport,
    restoreBudget,
    finishOnboarding,
    saveProfileSettings,
    clearBudget,
    syncContributionMirrors,
    // eslint-disable-next-line react-hooks/refs -- Cette fonction construit uniquement les gestionnaires d’événements.
    ...budgetCommands(dispatch, today),
    recordScheduledPayment,
    recordUnscheduledDebtPayment: saveUnscheduledDebtPayment,
    undoScheduledPayment,
    lastAddedSpendingId,
    undoLastSpending,
  };

  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
