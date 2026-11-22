'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppContext, budgetCommands, useApp, type AppContextType } from '@/lib/context/AppContext';
import { calculateBudgetSummary } from '@/lib/budget-calculations';
import { reduceBudget, type AppAction } from '@/lib/budget-reducer';
import { emptyBudgetState, recordPayment, recordUnscheduledDebtPayment, serializeBudget, type AppState } from '@/lib/budget-state';
import { cloudClient } from '@/lib/cloud-remote';
import { diffHousehold } from '@/lib/household-diff';
import { materializeHousehold } from '@/lib/household-materialize';
import { householdCopy } from '@/lib/household-copy';
import { fetchHouseholdKey } from '@/lib/household-key';
import { assertHouseholdAccount, HouseholdAccessRevoked, householdRemote } from '@/lib/household-remote';
import { emptyHouseholdQueue, readHouseholdCache, updateHouseholdCache, type StoredHousehold } from '@/lib/household-storage';
import { decodeHouseholdView, encodeHouseholdWrites, reconcileHouseholdSync, syncHousehold } from '@/lib/household-sync';
import { envelopesOf, spendingsOf } from '@/lib/spending';

type SavedView = { budget: AppState; pending: number };
type Change = (budget: AppState) => AppState;
type Options = {
  paymentDate?: string;
  unscheduledPayment?: { id: string; debtId: string; date: string };
  undo?: boolean;
  spendingId?: string;
};

export default function HouseholdBudget({ userId, householdId, onExit, children }: {
  userId: string; householdId: string; onExit: () => void; children: ReactNode;
}) {
  const { today } = useApp();
  const [view, setView] = useState<SavedView | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [network, setNetwork] = useState<'loading' | 'syncing' | 'offline' | 'saved' | 'error'>('loading');
  const [failure, setFailure] = useState('');
  const [lastSpending, setLastSpending] = useState<string>();
  const initialized = useRef(false);
  const inProgress = useRef(false);
  const retrySync = useRef(false);
  const renderVersion = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const undo = useRef<{ before: AppState; after: string } | null>(null);
  const spendingUndo = useRef<string | null>(null);

  const display = useCallback(async (cache: StoredHousehold) => {
    const version = ++renderVersion.current;
    assertHouseholdAccount(userId);
    if (cache.userId !== userId || cache.householdId !== householdId) throw new Error(householdCopy.unavailable);
    const budget = cache.revoked ? null : materializeHousehold(await decodeHouseholdView(cache.key, householdId, cache));
    assertHouseholdAccount(userId);
    if (!initialized.current || version !== renderVersion.current) return;
    setRevoked(!!cache.revoked);
    setView(budget ? { budget, pending: cache.pending.length } : null);
  }, [householdId, userId]);

  const synchronize = useCallback(async function synchronize() {
    if (!initialized.current) return;
    if (inProgress.current) {
      retrySync.current = true;
      return;
    }
    if (!navigator.onLine) {
      setNetwork('offline');
      return;
    }
    inProgress.current = true;
    setNetwork('syncing');
    try {
      assertHouseholdAccount(userId);
      const remote = await householdRemote(userId, householdId);
      const cached = await readHouseholdCache(userId, householdId);
      const key = cached ?? await fetchHouseholdKey(cloudClient().auth, userId, householdId);
      const result = await syncHousehold(remote, !cached || cached.revoked ? emptyHouseholdQueue : cached);
      if (!initialized.current) return;
      const updated = await updateHouseholdCache(userId, householdId, (current) => {
        assertHouseholdAccount(userId);
        // Une première lecture validée peut réouvrir un foyer réintégré.
        const { revoked: wasRevoked, ...stored } = current ?? { ...key, ...emptyHouseholdQueue };
        const queue = wasRevoked ? { ...emptyHouseholdQueue, pending: stored.pending } : stored;
        return { ...stored, ...reconcileHouseholdSync(queue, result) };
      });
      await display(updated);
      if (!initialized.current) return;
      setNetwork('saved');
      if (updated.pending.length) retrySync.current = true;
    } catch (error) {
      if (!initialized.current) return;
      if (error instanceof HouseholdAccessRevoked) {
        setRevoked(true);
        setView(null);
        const cached = await readHouseholdCache(userId, householdId).catch(() => undefined);
        if (cached) {
          await updateHouseholdCache(userId, householdId, current => ({ ...(current ?? cached), revoked: true })).catch(() => undefined);
        }
      }
      setNetwork(navigator.onLine ? 'error' : 'offline');
    } finally {
      inProgress.current = false;
      if (retrySync.current) {
        retrySync.current = false;
        void synchronize();
      }
    }
  }, [display, householdId, userId]);

  useEffect(() => {
    initialized.current = true;
    let disposed = false;
    void readHouseholdCache(userId, householdId).then(async cache => {
      if (disposed) return;
      if (cache) await display(cache);
      if (!disposed) await synchronize();
    }).catch(() => { if (!disposed) setNetwork('error'); });
    const refresh = () => { if (document.visibilityState === 'visible') void synchronize(); };
    const offline = () => setNetwork('offline');
    window.addEventListener('online', refresh);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      disposed = true;
      initialized.current = false;
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, [display, householdId, synchronize, userId]);

  function save(change: Change, options: Options = {}) {
    assertHouseholdAccount(userId);
    if (!view || revoked) throw new Error(householdCopy.unavailable);
    const newCheckpointId = crypto.randomUUID();
    saveQueue.current = saveQueue.current.then(async () => {
      assertHouseholdAccount(userId);
      const cache = await readHouseholdCache(userId, householdId);
      if (!cache || cache.revoked) throw new Error(householdCopy.revoked);
      const rows = await decodeHouseholdView(cache.key, householdId, cache);
      const before = materializeHousehold(rows);
      const next = change(before);
      const changes = diffHousehold(before, next, { rows, newCheckpointId, ...options });
      if (!changes.length) return;
      const encrypted = await encodeHouseholdWrites(cache.key, cache, changes);
      const updated = await updateHouseholdCache(userId, householdId, current => {
        assertHouseholdAccount(userId);
        if (!current || current.revoked) throw new Error(householdCopy.revoked);
        return { ...current, pending: [...current.pending, ...encrypted] };
      });
      if (!initialized.current) return;
      undo.current = options.undo ? { before, after: serializeBudget(next) } : null;
      spendingUndo.current = options.spendingId ? serializeBudget(next) : null;
      setLastSpending(options.spendingId);
      setFailure('');
      await display(updated);
      void synchronize();
    }).catch((error: unknown) => {
      if (initialized.current) setFailure(error instanceof Error ? error.message : householdCopy.saveFailed);
    });
  }

  function dispatch(action: AppAction) {
    if (!view?.budget.balanceDate && (
      (action.type === 'ADD_SPENDING' && !action.spending.balanceIncluded) ||
      (action.type === 'RECORD_PAYMENT' && !action.payload.balanceIncludesPayment)
    )) {
      throw new Error(householdCopy.enterBalance);
    }
    save((budget) => reduceBudget({
      ...budget, storageStatus: 'ready', storageRevision: 0, lastBackupDate: null,
    }, action), { paymentDate: today, spendingId: action.type === 'ADD_SPENDING' ? action.spending.id : undefined });
  }

  const unavailable = () => { throw new Error(householdCopy.unavailable); };
  const budget = view?.budget ?? emptyBudgetState;
  const summary = calculateBudgetSummary(
    budget.currentBalance, budget.incomes, budget.expenses, budget.debts, budget.childExpenses,
    budget.userProfile.safetyReserve, budget.goals, today,
    { envelopes: envelopesOf(budget), spendings: spendingsOf(budget) },
  );
  const context: AppContextType = {
    ...budget,
    summary,
    advice: [],
    today,
    storageBlocked: !view || revoked,
    isBudgetLoading: !view,
    needsOnboarding: false,
    canExportBudget: false,
    isCurrentBudget: () => !!view && !revoked,
    reloadStoredBudget: () => { void synchronize(); },
    lastBackupDate: null,
    exportBudget: unavailable,
    recordBackupExport: unavailable,
    restoreBudget: unavailable,
    finishOnboarding: unavailable,
    saveProfileSettings: ({ safetyReserve }) => dispatch({ type: 'UPDATE_PROFILE', payload: { safetyReserve } }),
    clearBudget: unavailable,
    // eslint-disable-next-line react-hooks/refs -- Cette fonction construit uniquement les gestionnaires d’événements.
    ...budgetCommands(dispatch, today),
    recordScheduledPayment: (payment) => {
      if (!budget.balanceDate) throw new Error(householdCopy.enterBalance);
      save((previous) => {
        const next = recordPayment(previous, { ...payment, today, balanceIncludesPayment: false });
        if (next === previous) throw new Error(householdCopy.paymentInvalid);
        return next;
      }, { paymentDate: today, undo: true });
    },
    recordUnscheduledDebtPayment: (payment) => {
      if (!budget.balanceDate && !payment.balanceIncludesPayment) throw new Error(householdCopy.enterBalance);
      save((previous) => {
        const next = recordUnscheduledDebtPayment(previous, { ...payment, today });
        if (next === previous) throw new Error(householdCopy.paymentInvalid);
        return next;
      }, { unscheduledPayment: { id: crypto.randomUUID(), debtId: payment.id, date: today } });
    },
    undoScheduledPayment: () => {
      const last = undo.current;
      if (!last) throw new Error(householdCopy.undoUnavailable);
      save((previous) => {
        if (serializeBudget(previous) !== last.after) throw new Error(householdCopy.undoUnavailable);
        return last.before;
      });
    },
    lastAddedSpendingId: lastSpending,
    undoLastSpending: () => {
      const after = spendingUndo.current;
      if (!lastSpending || !after) throw new Error(householdCopy.undoUnavailable);
      save((previous) => {
        if (serializeBudget(previous) !== after) throw new Error(householdCopy.undoUnavailable);
        return reduceBudget({
          ...previous, storageStatus: 'ready', storageRevision: 0, lastBackupDate: null,
        }, { type: 'DELETE_SPENDING', id: lastSpending });
      });
    },
  };
  const notice = failure || (revoked ? householdCopy.revoked : network === 'offline' ? householdCopy.offline :
    network === 'error' ? householdCopy.unavailable : view?.pending ? householdCopy.pending :
    !view ? householdCopy.loading : network === 'syncing' ? householdCopy.syncing :
    !view.budget.balanceDate ? householdCopy.enterBalance : '');

  return (
    <AppContext.Provider value={context}>
      {notice && (
        <div role={failure || revoked ? 'alert' : 'status'} className="mx-auto max-w-2xl px-4 pt-3 text-sm text-slate-700">
          <span>{notice}</span>
          {network === 'error' && !revoked && <button type="button" className="ms-3 min-h-11 font-semibold text-teal-800 underline"
            onClick={() => { void synchronize(); }}>{householdCopy.retry}</button>}
        </div>
      )}
      {view ? children : <main id="contenu" className="mx-auto max-w-2xl px-4 py-3">
        <button type="button" onClick={onExit} className="min-h-11 font-semibold text-teal-800 underline">{householdCopy.personal}</button>
      </main>}
    </AppContext.Provider>
  );
}
