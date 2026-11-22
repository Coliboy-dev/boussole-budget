import type { AppState } from './budget-state.ts';
import { householdCopy, householdMessages } from './household-copy.ts';
import { latestHouseholdRecords, type SequencedHouseholdRecord } from './household-records.ts';
import { isLocalDate } from './local-date.ts';
import { fromCents, toCents } from './money.ts';
import { addSpending, balanceRevisionOf, deleteSpending, spendingsOf, updateSpending } from './spending.ts';
import type { Income, Spending } from './types.ts';

export interface TransferDeclaration {
  transferId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  date: string;
  revision: string;
}

type ReplyStatus = 'confirmed' | 'not_received';
type TransferReply = { author: string; status: ReplyStatus; seq: number; hash: string };
export type HouseholdTransfer = TransferDeclaration & {
  hash: string;
  seq: number;
  status: 'declared' | ReplyStatus;
  answer?: TransferReply;
  history: TransferReply[];
};

export async function declarationHash(declaration: TransferDeclaration): Promise<string> {
  const { transferId, fromMemberId, toMemberId, amount, date, revision } = declaration;
  const canonical = JSON.stringify({ transferId, fromMemberId, toMemberId, amount, date, revision });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function recordObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export async function resolveHouseholdTransfers(
  rows: readonly SequencedHouseholdRecord[], localMemberId: string, cursor: number,
): Promise<HouseholdTransfer[]> {
  const declarations: Array<{ declaration: TransferDeclaration; seq: number }> = [];
  const replies = new Map<string, TransferReply[]>();
  for (const { record, seq, exclusive, authorMemberId } of latestHouseholdRecords(rows)) {
    if (!exclusive || (record.kind !== 'transfer' && record.kind !== 'transfer-response')) continue;
    const data = recordObject(record.data);
    if (!data || typeof data.transferId !== 'string') continue;
    if (record.kind === 'transfer') {
      const { transferId, fromMemberId, toMemberId, date, amount, revision } = data;
      const author = seq > cursor ? localMemberId : authorMemberId;
      if (author !== fromMemberId || record.id !== transferId || typeof fromMemberId !== 'string'
        || typeof toMemberId !== 'string' || fromMemberId === toMemberId || typeof revision !== 'string' || !revision
        || typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0 || !isLocalDate(date)) continue;
      declarations.push({ declaration: { transferId: record.id, fromMemberId, toMemberId, date, amount, revision }, seq: Math.min(seq, cursor) });
    } else if (seq <= cursor && authorMemberId && typeof data.declarationHash === 'string'
      && /^[a-f0-9]{64}$/.test(data.declarationHash) && (data.status === 'confirmed' || data.status === 'not_received')) {
      const answers = replies.get(data.transferId) ?? [];
      answers.push({ author: authorMemberId, hash: data.declarationHash, status: data.status, seq });
      replies.set(data.transferId, answers);
    }
  }
  return Promise.all(declarations.map(async ({ declaration, seq }) => {
    const hash = await declarationHash(declaration);
    const history = (replies.get(declaration.transferId) ?? []).filter(({ author }) => author === declaration.toMemberId);
    const answer = history.findLast(reply => reply.hash === hash);
    return { ...declaration, seq, hash, answer, history, status: answer?.status ?? 'declared' };
  }));
}

type Mirror = { id: string; seq: number };
type SpendingMirror = Mirror & { kind: 'debit'; amount: number; date: string; label: string };
type CreditMirror = Mirror & { kind: 'credit' | 'declined'; amount: number; date: string; revision: string };
export type MovementMirror = SpendingMirror | CreditMirror | (Mirror & { kind: 'remove-debit'; transfer?: true });

export function movementMirrors(
  rows: readonly SequencedHouseholdRecord[], transfers: HouseholdTransfer[],
  householdId: string, userId: string, memberId: string, cursor: number,
): MovementMirror[] {
  const changes: MovementMirror[] = [];
  for (const { record, seq, updatedBy, authorMemberId, exclusive } of latestHouseholdRecords(rows)) {
    const own = seq > cursor || updatedBy === userId;
    const version = Math.min(seq, cursor);
    if (record.kind === 'spending' && own && (seq > cursor || authorMemberId === memberId)) {
      const data = recordObject(record.data);
      const id = `${householdId}|advance|${record.id}`;
      if (!data) changes.push({ kind: 'remove-debit', id, seq: version });
      else if (data.paidFrom === 'personal' && data.paidBy === memberId && typeof data.amount === 'number'
        && Number.isSafeInteger(data.amount) && data.amount > 0 && isLocalDate(data.date)) {
        changes.push({ kind: 'debit', id, seq: version, date: data.date, amount: data.amount,
          label: householdMessages.advanceMirror(typeof data.label === 'string' ? data.label : '') });
      }
    }
    if (record.kind === 'transfer' && exclusive && !record.data && (seq > cursor || authorMemberId === memberId)) {
      changes.push({ kind: 'remove-debit', id: `${householdId}|transfer|${record.id}`, seq: version, transfer: true });
    }
  }

  for (const transfer of transfers) {
    const id = `${householdId}|transfer|${transfer.transferId}`;
    if (transfer.fromMemberId === memberId) {
      changes.push({ kind: 'debit', id, seq: transfer.seq, date: transfer.date,
        amount: transfer.amount, label: householdCopy.transferOutgoing });
    }
    if (transfer.toMemberId === memberId && transfer.answer) {
      changes.push({ kind: transfer.status === 'confirmed' ? 'credit' : 'declined', id,
        seq: transfer.answer.seq, amount: transfer.amount, date: transfer.date, revision: transfer.hash });
    }
  }
  return changes;
}

export function applyMovementMirrors<T extends AppState>(state: T, changes: MovementMirror[], today: string): T {
  let next = state;
  for (const change of changes) {
    const credit = change.kind === 'credit' || change.kind === 'declined';
    const retirementId = `${credit ? 'credit' : 'debit'}|${change.id}`;
    const retired = next.retiredHouseholdMovements?.[retirementId] ?? -1;
    if (change.seq <= retired) continue;
    if (change.kind === 'credit' || change.kind === 'declined') {
      const previous = next.incomes.find(({ linkedRecordId }) => linkedRecordId === change.id);
      if (change.date > today || (previous?.linkedRecordSeq ?? 0) >= change.seq) continue;
      const sameBalance = !previous || previous.balanceRevision === balanceRevisionOf(next);
      if (change.kind === 'declined') {
        if (!previous || previous.linkedRevision !== change.revision) continue;
        next = { ...next, incomes: next.incomes.filter(item => item !== previous),
          retiredHouseholdMovements: { ...next.retiredHouseholdMovements, [retirementId]: change.seq },
          currentBalance: sameBalance ? fromCents(toCents(next.currentBalance) - toCents(previous.amount)) : next.currentBalance };
        continue;
      }
      const income: Income = {
        id: change.id, linkedRecordId: change.id, linkedRecordSeq: change.seq, linkedRevision: change.revision,
        balanceRevision: previous?.balanceRevision ?? balanceRevisionOf(next),
        label: householdCopy.transferIncoming, type: 'household_transfer', frequency: 'one_time',
        isConfirmed: true, amount: fromCents(change.amount), expectedDate: change.date,
        occurrenceStatuses: { [change.date]: 'paid' }, occurrenceAmountsCents: { [change.date]: change.amount },
      };
      next = { ...next, incomes: previous ? next.incomes.map(item => item === previous ? income : item) : [...next.incomes, income],
        currentBalance: sameBalance ? fromCents(toCents(next.currentBalance) + change.amount - toCents(previous?.amount ?? 0)) : next.currentBalance };
      continue;
    }

    const spendings = spendingsOf(next);
    const previous = spendings.find(({ linkedRecordId }) => linkedRecordId === change.id);
    if ((previous?.linkedRecordSeq ?? 0) > change.seq) continue;
    if (change.kind === 'remove-debit') {
      if (!previous && !change.transfer) continue;
      if (previous) next = deleteSpending(next, previous.id);
      next = { ...next, retiredHouseholdMovements: { ...next.retiredHouseholdMovements, [retirementId]: change.seq } };
    } else if (change.kind === 'debit') {
      const { date, label } = change;
      const amount = fromCents(change.amount);
      if (!previous) {
        next = addSpending(next, { id: change.id, date, label, amount, category: 'household',
          balanceIncluded: false, linkedRecordId: change.id, linkedRecordSeq: change.seq }, today);
      } else if (date <= today && (previous.amount !== amount || previous.label !== label || previous.date !== date
        || previous.linkedRecordSeq !== change.seq)) {
        const updated = updateSpending(next, previous.id, { date, amount, label }, today);
        next = { ...updated, spendings: spendingsOf(updated).map(item =>
          item.id === previous.id ? { ...item, linkedRecordSeq: change.seq } : item) };
      }
    }
  }
  return next;
}

export function householdMovementTotals(spendings: Spending[], transfers: HouseholdTransfer[]) {
  const totals = new Map<string, { memberId: string; advancesCents: number; netCents: number }>();
  const totalFor = (memberId: string) => {
    const total = totals.get(memberId) ?? { memberId, advancesCents: 0, netCents: 0 };
    totals.set(memberId, total);
    return total;
  };
  for (const spending of spendings) {
    if (spending.paidFrom !== 'personal' || !spending.paidBy) continue;
    const total = totalFor(spending.paidBy);
    total.advancesCents += toCents(spending.amount);
    total.netCents += toCents(spending.amount);
  }
  for (const { fromMemberId, toMemberId, amount, status } of transfers) {
    if (status !== 'confirmed') continue;
    totalFor(fromMemberId).netCents += amount;
    totalFor(toMemberId).netCents -= amount;
  }
  return [...totals.values()];
}
