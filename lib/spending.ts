import { toMonthlyAmount } from './budget-calculations.ts';
import { isNonNegativeBudgetAmount, isSpendingAmount } from './budget-schema.ts';
import type { AppState } from './budget-state.ts';
import { isLocalDate } from './local-date.ts';
import { merchantKey } from './merchants.ts';
import { fromCents, toCents } from './money.ts';
import type { Envelope, Spending, SpendingCategory } from './types.ts';

export const spendingCategoryLabels: Record<SpendingCategory, string> = {
  groceries: 'Courses',
  restaurants: 'Restaurants et snacks',
  transport: 'Transport et carburant',
  health: 'Santé et pharmacie',
  leisure: 'Loisirs et sorties',
  clothing: 'Vêtements',
  home: 'Maison et bricolage',
  children: 'Enfants (quotidien)',
  cash: 'Retrait d’espèces',
  other: 'Autre',
};

export const envelopesOf = (state: AppState) => state.envelopes ?? [];
export const spendingsOf = (state: AppState) => state.spendings ?? [];
export const balanceGapsOf = (state: AppState) => state.balanceGaps ?? [];
export const merchantCategoriesOf = (state: AppState) => state.merchantCategories ?? {};
export const balanceRevisionOf = (state: AppState) => state.balanceRevision ?? 0;

type NewSpending = Omit<Spending, 'debited' | 'balanceRevision'>;
type SpendingChanges = Partial<Pick<Spending, 'date' | 'amount' | 'category' | 'label'>>;

function rememberCategory<T extends AppState>(state: T, spending: Spending): T {
  if (spending.category === 'household') return state;
  const key = merchantKey(spending.label ?? '');
  return key
    ? { ...state, merchantCategories: { ...merchantCategoriesOf(state), [key]: spending.category } }
    : state;
}

function affectsBalance(state: AppState, spending: Spending): boolean {
  return spending.debited && spending.balanceRevision === balanceRevisionOf(state);
}

export function addSpending<T extends AppState>(state: T, input: NewSpending, today: string): T {
  const spendings = spendingsOf(state);
  if (!isSpendingAmount(input.amount) || !isLocalDate(input.date) || input.date > today
    || !input.id.trim() || spendings.some(({ id }) => id === input.id)) return state;

  const spending = { ...input, debited: !input.balanceIncluded && input.paidFrom !== 'personal',
    balanceRevision: balanceRevisionOf(state) };
  return rememberCategory({
    ...state,
    currentBalance: spending.debited
      ? fromCents(toCents(state.currentBalance) - toCents(spending.amount))
      : state.currentBalance,
    spendings: [...spendings, spending],
  }, spending);
}

export function updateSpending<T extends AppState>(state: T, id: string, changes: SpendingChanges, today: string): T {
  const spendings = spendingsOf(state);
  const previous = spendings.find((spending) => spending.id === id);
  if (!previous) return state;

  const { date = previous.date, amount = previous.amount, category = previous.category } = changes;
  if (!isSpendingAmount(amount) || !isLocalDate(date) || date > today) return state;

  const spending = { ...previous, date, amount, category };
  if ('label' in changes) spending.label = changes.label;
  const difference = toCents(previous.amount) - toCents(amount);
  return rememberCategory({
    ...state,
    currentBalance: difference !== 0 && affectsBalance(state, previous)
      ? fromCents(toCents(state.currentBalance) + difference)
      : state.currentBalance,
    spendings: spendings.map((item) => item === previous ? spending : item),
  }, spending);
}

export function deleteSpending<T extends AppState>(state: T, id: string): T {
  const spendings = spendingsOf(state);
  const spending = spendings.find((item) => item.id === id);
  if (!spending) return state;

  return {
    ...state,
    currentBalance: affectsBalance(state, spending)
      ? fromCents(toCents(state.currentBalance) + toCents(spending.amount))
      : state.currentBalance,
    spendings: spendings.filter((item) => item !== spending),
  };
}

export function upsertEnvelope<T extends AppState>(state: T, envelope: Envelope): T {
  const envelopes = envelopesOf(state);
  if (!isNonNegativeBudgetAmount(envelope.monthlyAmount) || !envelope.id.trim()
    || envelopes.some(({ id, category }) => id === envelope.id && category !== envelope.category)) return state;

  const index = envelopes.findIndex(({ category }) => category === envelope.category);
  const updated = [...envelopes];
  if (index === -1) updated.push(envelope);
  else updated[index] = envelope;
  return { ...state, envelopes: updated };
}

export function deleteEnvelope<T extends AppState>(state: T, id: string): T {
  const envelopes = envelopesOf(state);
  const updated = envelopes.filter((envelope) => envelope.id !== id);
  return updated.length === envelopes.length ? state : { ...state, envelopes: updated };
}

export function replaceExpenseWithEnvelope<T extends AppState>(
  state: T, expenseId: string, category: SpendingCategory, monthlyAmount?: number,
): T {
  const expense = state.expenses.find(({ id }) => id === expenseId);
  if (!expense?.isRecurring || expense.frequency === 'one_time' || expense.category !== category) return state;

  const existing = envelopesOf(state).find((envelope) => envelope.category === category);
  const updated = upsertEnvelope(state, {
    id: existing?.id ?? `envelope-${expense.id}`,
    category,
    label: expense.label || spendingCategoryLabels[category],
    monthlyAmount: monthlyAmount ?? toMonthlyAmount(expense.amount, expense.frequency),
  });
  return updated === state ? state : { ...updated, expenses: state.expenses.filter((item) => item !== expense) };
}
