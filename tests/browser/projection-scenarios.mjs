// Budgets fictifs du 29 mai 2026 pour l’écran Échéances : serein, fragile, négatif, en retard, vide, sans échéance.
import { emptyBudgetState } from '../../lib/budget-state.ts';
import { mockChildExpenses, mockCurrentBalance, mockDebts, mockExpenses, mockIncomes, mockUser } from '../../lib/mock-data.ts';

export const today = '2026-05-29';

const demo = {
  ...emptyBudgetState, userProfile: mockUser, currentBalance: mockCurrentBalance, balanceDate: today,
  incomes: mockIncomes, expenses: mockExpenses, debts: mockDebts, childExpenses: mockChildExpenses,
};

export const scenarios = {
  demo,
  serein: { ...demo, currentBalance: 9000 },
  fragile: { ...demo, currentBalance: 720 },
  negatif: { ...demo, currentBalance: 120 },
  retard: { ...demo, expenses: demo.expenses.map((expense) => expense.label === 'Loyer' ? { ...expense, dueDate: '2026-05-20' } : expense) },
  vide: emptyBudgetState,
  'sans-echeance': { ...emptyBudgetState, currentBalance: 500, balanceDate: today },
};
