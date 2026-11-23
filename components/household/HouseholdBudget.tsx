'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppContext, budgetCommands, useApp, type AppContextType } from '@/lib/context/AppContext';
import { calculateBudgetSummary, formatDate } from '@/lib/budget-calculations';
import { reduceBudget, type AppAction } from '@/lib/budget-reducer';
import { emptyBudgetState, recordPayment, recordUnscheduledDebtPayment, serializeBudget, type AppState } from '@/lib/budget-state';
import { cloudClient } from '@/lib/cloud-remote';
import { diffHousehold } from '@/lib/household-diff';
import {
  contributionMirrorNeedsUpdate, contributionMirrorPlan, findContributionMirror, type ContributionMirrorPlan,
} from '@/lib/household-contributions';
import { materializeHousehold } from '@/lib/household-materialize';
import {
  movementMirrors, resolveHouseholdTransfers, type HouseholdTransfer, type MovementMirror, type TransferDeclaration,
} from '@/lib/household-movements';
import type { HouseholdRecord, SequencedHouseholdRecord } from '@/lib/household-records';
import { householdCopy, householdMessages } from '@/lib/household-copy';
import { fetchHouseholdKey } from '@/lib/household-key';
import { assertHouseholdAccount, HouseholdAccessRevoked, householdRemote } from '@/lib/household-remote';
import { emptyHouseholdQueue, readHouseholdCache, updateHouseholdCache, type StoredHousehold } from '@/lib/household-storage';
import { decodeHouseholdView, encodeHouseholdWrites, reconcileHouseholdSync, syncHousehold } from '@/lib/household-sync';
import { envelopesOf, spendingsOf } from '@/lib/spending';
import { useBudgetAccess } from '@/lib/budget-access';
import { toCents } from '@/lib/money';
import Card from '@/components/ui/Card';
import { isSpendingAmount } from '@/lib/budget-schema';
import { isLocalDate } from '@/lib/local-date';
import { HouseholdMovementsContext, type HouseholdMovements } from './HouseholdMovementsContext';

type SavedView = {
  budget: AppState; pending: number; mirrors?: ContributionMirrorPlan;
  transfers: HouseholdTransfer[]; movementMirrors: MovementMirror[]; names: Record<string, string>;
};
type Change = (budget: AppState) => AppState;
type Options = {
  paymentDate?: string;
  unscheduledPayment?: { id: string; debtId: string; date: string };
  undo?: boolean;
  spendingId?: string;
  extraRecords?: (rows: SequencedHouseholdRecord[], cursor: number) => Promise<HouseholdRecord[]>;
};

export default function HouseholdBudget({ userId, householdId, memberId, activeMemberIds, onExit, children }: {
  userId: string; householdId: string; onExit: () => void; children: ReactNode;
  memberId?: string;
  activeMemberIds?: string[];
}) {
  const { today, syncContributionMirrors, syncMovementMirrors, isBudgetLoading, storageBlocked, expenses: personalExpenses } = useApp();
  const personalBudgetAccessible = useBudgetAccess();
  const [view, setView] = useState<SavedView | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [network, setNetwork] = useState<'loading' | 'syncing' | 'offline' | 'saved' | 'error'>('loading');
  const [failure, setFailure] = useState('');
  const [lastSpending, setLastSpending] = useState<string>();
  const [dismissedOffers, setDismissedOffers] = useState<ReadonlySet<number>>(() => new Set());
  const initialized = useRef(false);
  const inProgress = useRef(false);
  const retrySync = useRef(false);
  const renderVersion = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const undo = useRef<{ before: AppState; after: string } | null>(null);
  const spendingUndo = useRef<string | null>(null);
  const automaticMirrors = view?.mirrors?.automatic;
  const movementChanges = view?.movementMirrors;
  const canWriteMirrors = personalBudgetAccessible && !isBudgetLoading && !storageBlocked;
  useEffect(() => {
    if (memberId && automaticMirrors?.length && canWriteMirrors) {
      syncContributionMirrors(userId, householdId, memberId, automaticMirrors, today);
    }
  }, [automaticMirrors, canWriteMirrors, householdId, memberId, syncContributionMirrors, today, userId]);
  useEffect(() => {
    if (movementChanges?.length && canWriteMirrors) syncMovementMirrors(userId, movementChanges, today);
  }, [canWriteMirrors, movementChanges, syncMovementMirrors, today, userId]);

  const display = useCallback(async (cache: StoredHousehold) => {
    const version = ++renderVersion.current;
    assertHouseholdAccount(userId);
    if (cache.userId !== userId || cache.householdId !== householdId) throw new Error(householdCopy.unavailable);
    const rows = cache.revoked ? [] : await decodeHouseholdView(cache.key, householdId, cache);
    const budget = cache.revoked ? null : materializeHousehold(rows);
    const transfers = memberId ? await resolveHouseholdTransfers(rows, memberId, cache.cursor) : [];
    const names: Record<string, string> = Object.create(null);
    for (const { record, authorMemberId } of rows) {
      if (record.kind === 'member' && record.id === authorMemberId && record.data && typeof record.data === 'object'
        && 'name' in record.data && typeof record.data.name === 'string') names[record.id] = record.data.name;
    }
    assertHouseholdAccount(userId);
    if (!initialized.current || version !== renderVersion.current) return;
    setRevoked(!!cache.revoked);
    setView(budget ? {
      budget, pending: cache.pending.length,
      mirrors: memberId ? contributionMirrorPlan(budget.incomes, rows, userId, memberId, cache.cursor) : undefined,
      transfers, names,
      movementMirrors: memberId ? movementMirrors(rows, transfers, householdId, userId, memberId, cache.cursor) : [],
    } : null);
  }, [householdId, memberId, userId]);

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
      if (options.extraRecords) changes.push(...await options.extraRecords(rows, cache.cursor));
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
    if (view?.budget.hasJointAccount === false && (action.type === 'SET_BALANCE' || action.type === 'RECORD_PAYMENT')) {
      throw new Error(householdCopy.noJointAccount);
    }
    if (action.type === 'ADD_SPENDING' && (action.spending.paidFrom === 'personal' || view?.budget.hasJointAccount === false)) {
      if (!memberId) throw new Error(householdCopy.accountChanged);
      action = { ...action, spending: { ...action.spending, paidFrom: 'personal', paidBy: memberId, balanceIncluded: false } };
    }
    if (!view?.budget.balanceDate && (
      (action.type === 'ADD_SPENDING' && !action.spending.balanceIncluded && action.spending.paidFrom !== 'personal') ||
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
  const partnerId = activeMemberIds?.find((id) => id !== memberId);
  function changeTransfer(transfer: HouseholdTransfer,
    write: (current: HouseholdTransfer) => HouseholdRecord[] | undefined) {
    if (!memberId) throw new Error(householdCopy.accountChanged);
    const actor = memberId;
    save((state) => state, { extraRecords: async (rows, cursor) => {
      const current = (await resolveHouseholdTransfers(rows, actor, cursor)).find(({ transferId }) => transferId === transfer.transferId);
      if (!current || current.hash !== transfer.hash) throw new Error(householdCopy.transferChanged);
      const records = write(current);
      if (!records) throw new Error(householdCopy.transferChanged);
      return records;
    } });
  }
  const movements: HouseholdMovements = {
    memberId, partnerId, transfers: view?.transfers ?? [],
    memberName: (id) => {
      if (id === memberId) return view?.names[id] || householdCopy.memberYou;
      if (!activeMemberIds?.includes(id)) return householdCopy.formerMember;
      return view?.names[id] || householdCopy.otherMember;
    },
    setHasJointAccount: (enabled) => save((state) => ({ ...state, hasJointAccount: enabled })),
    declare: ({ amount, date }, previous) => {
      if (!memberId || !partnerId) throw new Error(householdCopy.transferPartnerNeeded);
      if (!isSpendingAmount(amount) || !isLocalDate(date) || date > today) throw new Error(householdCopy.transferChanged);
      const transferId = previous?.transferId ?? crypto.randomUUID();
      const data: TransferDeclaration = {
        transferId, fromMemberId: memberId, toMemberId: previous?.toMemberId ?? partnerId,
        date, amount: toCents(amount), revision: crypto.randomUUID(),
      };
      const record: HouseholdRecord = { kind: 'transfer', id: transferId, data };
      if (previous) changeTransfer(previous, (current) => current.fromMemberId === memberId ? [record] : undefined);
      else save((state) => state, { extraRecords: async () => [record] });
    },
    reply: (transfer, status) => {
      changeTransfer(transfer, (current) => current.toMemberId === memberId && current.status === 'declared' ? [{
        kind: 'transfer-response', id: crypto.randomUUID(),
        data: { transferId: current.transferId, declarationHash: current.hash, status },
      }] : undefined);
    },
    remove: (transfer) => {
      changeTransfer(transfer, (current) => current.fromMemberId === memberId && current.status !== 'confirmed'
        ? [{ kind: 'transfer', id: current.transferId }] : undefined);
    },
  };
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
    syncContributionMirrors: unavailable,
    syncMovementMirrors: unavailable,
    // eslint-disable-next-line react-hooks/refs -- Cette fonction construit uniquement les gestionnaires d’événements.
    ...budgetCommands(dispatch, today),
    addIncome: (income) => {
      if (income.type !== 'household_contribution') {
        dispatch({ type: 'ADD_INCOME', payload: income });
        return;
      }
      if (!memberId || income.contributionMemberId !== memberId) throw new Error(householdCopy.contributionUnavailable);
      const id = `contribution|${memberId}`;
      save((previous) => {
        const current = previous.incomes.find((item) => item.id === id);
        const contribution = {
          ...income, id, isConfirmed: false,
          occurrenceStatuses: current?.occurrenceStatuses, occurrenceAmountsCents: current?.occurrenceAmountsCents,
        };
        return { ...previous, incomes: [...previous.incomes.filter((item) => item.id !== id), contribution] };
      });
    },
    recordScheduledPayment: (payment) => {
      if (budget.hasJointAccount === false) throw new Error(householdCopy.noJointAccount);
      if (!budget.balanceDate) throw new Error(householdCopy.enterBalance);
      save((previous) => {
        const next = recordPayment(previous, { ...payment, today, balanceIncludesPayment: false });
        if (next === previous) throw new Error(householdCopy.paymentInvalid);
        return next;
      }, { paymentDate: today, undo: true });
    },
    recordUnscheduledDebtPayment: (payment) => {
      if (budget.hasJointAccount === false) throw new Error(householdCopy.noJointAccount);
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
    !view.budget.balanceDate && view.budget.hasJointAccount !== false ? householdCopy.enterBalance : '');

  return (
    <AppContext.Provider value={context}>
    <HouseholdMovementsContext.Provider value={movements}>
      {notice && (
        <div role={failure || revoked ? 'alert' : 'status'} className="mx-auto max-w-2xl px-4 pt-3 text-sm text-slate-700">
          <span>{notice}</span>
          {network === 'error' && !revoked && <button type="button" className="ms-3 min-h-11 font-semibold text-teal-800 underline"
            onClick={() => { void synchronize(); }}>{householdCopy.retry}</button>}
        </div>
      )}
      {canWriteMirrors && memberId && view?.mirrors?.proposals
        .filter((offer) => !dismissedOffers.has(offer.seq) && contributionMirrorNeedsUpdate(personalExpenses, householdId, offer))
        .map((offer) => {
          const { income } = offer;
          const updating = Boolean(findContributionMirror(personalExpenses, householdId, income.id));
          return (
            <aside key={offer.seq} aria-label={householdCopy.mirrorOffer} className="mx-auto max-w-2xl px-4 pt-3">
              <Card className="space-y-2">
                <p className="text-sm font-medium">{householdMessages.contributionMirrorOffer(toCents(income.amount), income.frequency, updating)}</p>
                {income.expectedDate && <p className="text-sm text-slate-700">
                  {householdCopy.contributionDate}{' '}<time dateTime={income.expectedDate}>{formatDate(income.expectedDate)}</time>
                </p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white"
                    onClick={() => syncContributionMirrors(userId, householdId, memberId, [offer], today)}>
                    {updating ? householdCopy.mirrorUpdate : householdCopy.mirrorAccept}
                  </button>
                  <button type="button" className="min-h-11 px-3 text-sm font-semibold text-teal-800 underline"
                    onClick={() => setDismissedOffers((dismissed) => new Set(dismissed).add(offer.seq))}>
                    {householdCopy.mirrorLater}
                  </button>
                </div>
              </Card>
            </aside>
          );
        })}
      {view ? children : <main id="contenu" className="mx-auto max-w-2xl px-4 py-3">
        <button type="button" onClick={onExit} className="min-h-11 font-semibold text-teal-800 underline">{householdCopy.personal}</button>
      </main>}
    </HouseholdMovementsContext.Provider>
    </AppContext.Provider>
  );
}
