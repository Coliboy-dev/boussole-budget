import { addMonths, isLocalDate } from './local-date.ts';
import { monthlyCents } from './money.ts';
import { expenseOccurrences, isOpenOccurrence } from './occurrences.ts';
import type { Expense } from './types.ts';

export function annualProvisionsCents(expenses: Expense[], today: string, end: string): number {
  let total = 0;

  for (const expense of expenses) {
    if (!expense.isRecurring || expense.frequency !== 'annual' || !isLocalDate(expense.dueDate)) continue;

    // Search through a full cycle after the anchor and the last explicitly handled occurrence.
    const lastKnown = Object.keys(expense.occurrenceStatuses ?? {}).reduce(
      (latest, date) => date > latest ? date : latest,
      expense.dueDate > today ? expense.dueDate : today,
    );
    const searchEnd = lastKnown > '9998-12-31' ? '9999-12-31' : addMonths(lastKnown, 12);
    const occurrences = expenseOccurrences(expense, today, searchEnd);
    const nextUnpaid = occurrences.find(isOpenOccurrence);
    const prepaidInPeriod = occurrences.some(({ dueDate, status }) =>
      status === 'paid' && dueDate >= today && dueDate <= end);

    if (nextUnpaid && nextUnpaid.dueDate > end && !prepaidInPeriod) {
      total += monthlyCents(expense.amount, 'annual');
    }
  }

  return total;
}
