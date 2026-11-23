import { assertBudgetState } from './budget-schema.ts';
import { convertAmounts, emptyBudgetState, type AppState } from './budget-state.ts';
import { materializeHouseholdBalance } from './household-balance.ts';
import { latestHouseholdRecords, type SequencedHouseholdRecord } from './household-records.ts';
import { fromCents, toCents } from './money.ts';
import type { Schedule, SpendingCategory } from './types.ts';

export const sharedCollections = {
  income: 'incomes', expense: 'expenses', debt: 'debts', envelope: 'envelopes',
  goal: 'goals', spending: 'spendings', gap: 'balanceGaps', 'child-expense': 'childExpenses',
} as const;

export const occurrenceCollections = { income: 'incomes', expense: 'expenses', debt: 'debts' } as const;
export type HouseholdOccurrence = {
  entityKind: keyof typeof occurrenceCollections;
  entityId: string;
  dueDate: string;
  status: NonNullable<Schedule['occurrenceStatuses']>[string];
  paymentDate?: string;
  amountCents?: number;
};

export function materializeHousehold(rows: readonly SequencedHouseholdRecord[]): AppState {
  const latest = latestHouseholdRecords(rows);
  const state = convertAmounts(emptyBudgetState, toCents);
  const schedules = new Map<string, Schedule>();
  const occurrences: HouseholdOccurrence[] = [];

  for (const { record } of latest) {
    if (Object.hasOwn(sharedCollections, record.kind)) {
      const collection = sharedCollections[record.kind as keyof typeof sharedCollections];
      const items = (state[collection] ??= []) as Array<{ id: string } & Schedule>;
      if (record.data === undefined) continue;
      const item = { ...record.data as object, id: record.id } as { id: string } & Schedule;
      delete item.occurrenceStatuses;
      delete item.occurrenceAmountsCents;
      if (record.kind === 'income' && 'type' in item && item.type === 'household_contribution') {
        Object.assign(item, { isConfirmed: false });
      }
      items.push(item);
      schedules.set(`${record.kind}|${record.id}`, item);
    } else if (record.data === undefined) {
      continue;
    } else if (record.kind === 'settings') {
      const { safetyReserve } = record.data as { safetyReserve?: number };
      if (safetyReserve !== undefined) state.userProfile.safetyReserve = safetyReserve;
    } else if (record.kind === 'occurrence') {
      occurrences.push(record.data as HouseholdOccurrence);
    } else if (record.kind === 'merchant') {
      state.merchantCategories = { ...state.merchantCategories, [record.id]: record.data as SpendingCategory };
    }
  }

  for (const { entityKind, entityId, dueDate, status, amountCents } of occurrences) {
    const schedule = schedules.get(`${entityKind}|${entityId}`);
    if (!schedule) continue;
    (schedule.occurrenceStatuses ??= {})[dueDate] = status;
    if (status === 'paid' && amountCents !== undefined) (schedule.occurrenceAmountsCents ??= {})[dueDate] = amountCents;
  }

  assertBudgetState(state, 'cents');
  const budget = materializeHouseholdBalance(convertAmounts(state, fromCents), latest);
  assertBudgetState(budget, 'euros');
  return budget;
}
