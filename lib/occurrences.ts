import type { ChildExpense, Debt, Expense, Frequency, Income, OccurrenceStatus, Schedule } from './types.ts';
import { addDays, addMonths, daysBetween, isLocalDate, monthsBetween } from './local-date.ts';
import { toCents } from './money.ts';

export interface Occurrence {
  sourceId: string;
  dueDate: string;
  label: string;
  amountCents: number;
  type: 'income' | 'expense' | 'debt' | 'child';
  isEstimated: boolean;
  status: OccurrenceStatus;
}

const monthIntervals = { monthly: 1, bi_monthly: 2, quarterly: 3, annual: 12 };

function recurrenceDates(anchor: string, frequency: Frequency, from: string, through: string): string[] {
  if (frequency === 'one_time') return anchor >= from && anchor <= through ? [anchor] : [];

  const isWeekly = frequency === 'weekly';
  const interval = isWeekly ? 7 : monthIntervals[frequency];
  if (!interval) return [];
  const distance = isWeekly ? daysBetween(anchor, from) : monthsBetween(anchor, from);
  const dateAt = isWeekly ? addDays : addMonths;
  const result: string[] = [];

  for (let index = Math.max(0, Math.floor(distance / interval)); ; index++) {
    const date = dateAt(anchor, index * interval);
    if (date > through || date.length !== 10) return result;
    if (date >= from) result.push(date);
  }
}

function scheduleDates(
  schedule: Schedule,
  anchor: string | undefined,
  frequency: Frequency,
  today: string,
  end: string,
  includeLate: boolean,
): string[] {
  if (!isLocalDate(anchor)) return [];
  const through = isLocalDate(schedule.endDate) && schedule.endDate < end ? schedule.endDate : end;
  const trackedFrom = schedule.trackedFrom;
  let from = today;

  if (includeLate && frequency === 'one_time') {
    from = anchor;
  } else if (includeLate && isLocalDate(trackedFrom) && trackedFrom < today) {
    from = trackedFrom;
  } else if (includeLate && frequency !== 'one_time' && !isLocalDate(trackedFrom) && anchor < today) {
    // A legacy anchor can identify one overdue bill. It does not establish older unpaid cycles.
    const following = frequency === 'weekly' ? addDays(anchor, 7) : addMonths(anchor, monthIntervals[frequency]);
    if (following > today) from = anchor;
  }

  return recurrenceDates(anchor, frequency, from, through);
}

function statusFor(schedule: Schedule, dueDate: string, today: string): OccurrenceStatus {
  const status = schedule.occurrenceStatuses?.[dueDate];
  return status === 'paid' || status === 'cancelled' ? status : dueDate < today ? 'late' : 'planned';
}

export function isOpenOccurrence(occurrence: Occurrence): boolean {
  return occurrence.status === 'planned' || occurrence.status === 'late';
}

export function expenseOccurrences(expense: Expense, today: string, end: string): Occurrence[] {
  const frequency = expense.isRecurring ? expense.frequency : 'one_time';
  return scheduleDates(expense, expense.dueDate, frequency, today, end, true).map((dueDate) => ({
    sourceId: expense.id,
    dueDate,
    label: expense.label,
    amountCents: -toCents(expense.amount),
    type: 'expense',
    isEstimated: false,
    status: expense.isPaid && dueDate === expense.dueDate ? 'paid' : statusFor(expense, dueDate, today),
  }));
}

export function debtOccurrences(debt: Debt, today: string, end: string): Occurrence[] {
  if (debt.status === 'completed' || debt.status === 'suspended') return [];

  let remainingCents = Math.max(0, toCents(debt.remainingAmount));
  const monthlyCents = Math.max(0, toCents(debt.monthlyPayment));
  if (remainingCents === 0) return [];

  // A V1 debt marked late establishes the entered arrear, without inventing intervening arrears.
  const undatedArrear = !debt.nextDueDate && debt.status === 'late';
  const anchor = undatedArrear ? today : debt.nextDueDate;
  const dates = scheduleDates(debt, anchor, monthlyCents ? 'monthly' : 'one_time', today, end, true);
  if (debt.status === 'late' && !isLocalDate(debt.trackedFrom) && isLocalDate(anchor)
    && anchor < today && !dates.includes(anchor) && (!debt.endDate || anchor <= debt.endDate)) {
    dates.unshift(anchor);
  }
  const result: Occurrence[] = [];

  for (const dueDate of dates) {
    const savedStatus = statusFor(debt, dueDate, today);
    const status = savedStatus === 'planned' && undatedArrear && dueDate === today
      ? 'late' : savedStatus;
    const amountCents = Math.min(remainingCents, monthlyCents || remainingCents);
    if (amountCents === 0) break;

    result.push({
      sourceId: debt.id,
      dueDate,
      label: `Remboursement ${debt.creditor}`,
      amountCents: -amountCents,
      type: 'debt',
      isEstimated: false,
      status,
    });
    if (status === 'planned' || status === 'late') remainingCents -= amountCents;
  }
  return result;
}

export function incomeOccurrences(income: Income, today: string, end: string): Occurrence[] {
  return scheduleDates(income, income.expectedDate, income.frequency, today, end, false)
    .map((dueDate) => ({
      sourceId: income.id,
      dueDate,
      label: income.label,
      amountCents: toCents(income.amount),
      type: 'income',
      isEstimated: !income.isConfirmed,
      status: statusFor(income, dueDate, today),
    }));
}

function reimbursements(expenses: ChildExpense[], today: string, end: string): Occurrence[] {
  return expenses.flatMap((item) => {
    const dueDate = item.reimbursementDate;
    if (item.status === 'reimbursed' || !isLocalDate(dueDate) || dueDate < today || dueDate > end) return [];
    const amountCents = toCents(item.shareAmount);
    if (amountCents <= 0) return [];

    return [{
      sourceId: item.id,
      dueDate,
      label: `Remboursement : ${item.label}`,
      amountCents,
      type: 'child',
      isEstimated: true,
      status: 'planned',
    }];
  });
}

export function forecastOccurrences(
  incomes: Income[],
  expenses: Expense[],
  debts: Debt[],
  childExpenses: ChildExpense[],
  today: string,
  end: string,
): Occurrence[] {
  return [
    ...incomes.flatMap((income) => incomeOccurrences(income, today, end)),
    ...expenses.flatMap((expense) => expenseOccurrences(expense, today, end)),
    ...debts.flatMap((debt) => debtOccurrences(debt, today, end)),
    ...reimbursements(childExpenses, today, end),
  ].filter(isOpenOccurrence);
}
