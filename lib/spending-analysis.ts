import type { AppState } from './budget-state.ts';
import { addMonths, isLocalDate } from './local-date.ts';
import { toCents } from './money.ts';
import { balanceGapsOf, spendingCategoryLabels, spendingsOf } from './spending.ts';
import type { ExpenseCategory, SpendingCategory } from './types.ts';

export type AnalysisCategory = SpendingCategory | ExpenseCategory | 'debts' | 'unrecorded';

interface MonthItem {
  date: string;
  label: string;
  cents: number;
  source: 'spending' | 'expense' | 'debt' | 'gap';
  id: string;
}

type CategorizedItem = MonthItem & { category: AnalysisCategory };

export interface MonthAnalysis {
  month: string;
  totalCents: number;
  rows: { category: AnalysisCategory; cents: number; previousCents: number; averageCents: number | null }[];
  unrecordedCents: number;
  recordedCount: number;
}

function paidDates(statuses: Record<string, 'paid' | 'cancelled'> | undefined, month: string): string[] {
  return Object.entries(statuses ?? {})
    .filter(([date, status]) => status === 'paid' && date.slice(0, 7) === month)
    .map(([date]) => date);
}

function itemsInMonth(state: AppState, month: string): CategorizedItem[] {
  const spendings = spendingsOf(state);
  const items: CategorizedItem[] = [];
  for (const { date, amount, label, id, category } of spendings) {
    if (date.slice(0, 7) !== month) continue;
    items.push({ date, cents: toCents(amount), label: label || spendingCategoryLabels[category], source: 'spending', id, category });
  }

  for (const expense of state.expenses) {
    const dates = new Set(paidDates(expense.occurrenceStatuses, month));
    if (expense.isPaid && expense.dueDate?.slice(0, 7) === month) dates.add(expense.dueDate);
    for (const date of dates) {
      items.push({
        date, label: expense.label, cents: toCents(expense.amount),
        source: 'expense', id: expense.id, category: expense.category,
      });
    }
  }

  for (const debt of state.debts) {
    for (const date of paidDates(debt.occurrenceStatuses, month)) {
      items.push({
        date, label: `Remboursement ${debt.creditor}`, cents: toCents(debt.monthlyPayment),
        source: 'debt', id: debt.id, category: 'debts',
      });
    }
  }

  for (const gap of balanceGapsOf(state)) {
    if (gap.date.slice(0, 7) !== month || gap.amount <= 0) continue;
    const encoded = spendings
      .filter(({ date, balanceIncluded }) => balanceIncluded && date > gap.fromDate && date <= gap.date)
      .reduce((total, spending) => total + toCents(spending.amount), 0);
    const cents = toCents(gap.amount) - encoded;
    if (cents > 0) {
      items.push({ date: gap.date, label: 'Non encodé', cents, source: 'gap', id: gap.id, category: 'unrecorded' });
    }
  }
  return items;
}

function categoryTotals(items: CategorizedItem[]): Map<AnalysisCategory, number> {
  const totals = new Map<AnalysisCategory, number>();
  for (const { category, cents } of items) totals.set(category, (totals.get(category) ?? 0) + cents);
  return totals;
}

export function analyzeMonth(state: AppState, month: string): MonthAnalysis {
  const start = `${month}-01`;
  if (!isLocalDate(start)) return { month, rows: [], totalCents: 0, unrecordedCents: 0, recordedCount: 0 };

  const items = itemsInMonth(state, month);
  const totals = categoryTotals(items);
  const previous = [1, 2, 3].map((offset) => categoryTotals(itemsInMonth(state, addMonths(start, -offset).slice(0, 7))));
  const sampled = previous.filter((period) => period.size > 0);

  return {
    month,
    rows: [...totals].map(([category, cents]) => ({
      category,
      cents,
      previousCents: previous[0].get(category) ?? 0,
      averageCents: sampled.length > 0
        ? Math.round(sampled.reduce((sum, period) => sum + (period.get(category) ?? 0), 0) / sampled.length)
        : null,
    })).sort((first, second) => second.cents - first.cents),
    totalCents: items.reduce((sum, { cents }) => sum + cents, 0),
    unrecordedCents: totals.get('unrecorded') ?? 0,
    recordedCount: items.filter(({ source }) => source === 'spending').length,
  };
}

export function monthItems(state: AppState, month: string, category: AnalysisCategory): MonthItem[] {
  return itemsInMonth(state, month)
    .filter((item) => item.category === category)
    .map(({ date, label, cents, source, id }) => ({ date, label, cents, source, id }))
    .sort((first, second) => second.date.localeCompare(first.date));
}
