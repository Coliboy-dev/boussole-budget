import { isBudgetAmount, isNonNegativeBudgetAmount } from './budget-schema.ts';
import type { AppState } from './budget-state.ts';
import { isLocalDate } from './local-date.ts';
import { fromCents, toCents } from './money.ts';

export interface FirstBudgetInput {
  balance: number;
  income?: { amount: number; date: string };
  bills: { label: string; amount: number; date: string }[];
}

export function parseAmountInput(text: string): number {
  const value = text.trim();
  if (!/^[+-]?(?:(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d{1,2})?|[.,]\d{1,2})$/.test(value)) {
    return NaN;
  }
  return Number(value.replace(/[ \u00a0\u202f]/g, '').replace(',', '.'));
}

export function isPositiveOnboardingAmount(amount: number): boolean {
  return isNonNegativeBudgetAmount(amount) && amount > 0;
}

export function createFirstBudget(budget: AppState, input: FirstBudgetInput, today: string): AppState {
  if (!isBudgetAmount(input.balance)) throw new Error('Renseigne un solde bancaire valide.');

  const { income, bills } = input;
  if (income && (!isPositiveOnboardingAmount(income.amount) || !isLocalDate(income.date) || income.date < today)) {
    throw new Error('Vérifie le montant et la date de ta prochaine rentrée d’argent.');
  }
  if (bills.some((bill) => !bill.label.trim() || !isPositiveOnboardingAmount(bill.amount) || !isLocalDate(bill.date))) {
    throw new Error('Vérifie les montants et dates de tes factures.');
  }

  return {
    ...budget,
    currentBalance: fromCents(toCents(input.balance)),
    balanceDate: today,
    incomes: income ? [{
      id: 'initial-income',
      label: 'Prochaine rentrée d’argent',
      type: 'other',
      amount: fromCents(toCents(income.amount)),
      frequency: 'one_time',
      expectedDate: income.date,
      isConfirmed: true,
    }] : [],
    expenses: bills.map((bill, index) => ({
      id: `initial-bill-${index + 1}`,
      label: bill.label.trim(),
      category: 'other',
      amount: fromCents(toCents(bill.amount)),
      frequency: 'one_time',
      dueDate: bill.date,
      isPaid: false,
      isRecurring: false,
    })),
  };
}
