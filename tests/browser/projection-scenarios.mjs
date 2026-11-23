// Budgets fictifs du 29 mai 2026 pour l’écran Échéances : serein, fragile, négatif, en retard, vide, sans échéance.
// La démo compte 16 échéances sur 35 jours : de quoi vérifier la lisibilité d’une longue liste.
import { emptyBudgetState } from '../../lib/budget-state.ts';
import { mockChildExpenses, mockCurrentBalance, mockDebts, mockExpenses, mockIncomes, mockUser } from '../../lib/mock-data.ts';

export const today = '2026-05-29';

const demo = {
  ...emptyBudgetState, userProfile: mockUser, currentBalance: mockCurrentBalance, balanceDate: today,
  incomes: mockIncomes, expenses: mockExpenses, debts: mockDebts, childExpenses: mockChildExpenses,
};

const lateRent = demo.expenses.map((expense) => expense.label === 'Loyer' ? { ...expense, dueDate: '2026-05-20' } : expense);

export const scenarios = {
  demo,
  serein: { ...demo, currentBalance: 9000 },
  fragile: { ...demo, currentBalance: 720 },
  negatif: { ...demo, currentBalance: 120 },
  retard: { ...demo, expenses: lateRent },
  'negatif-retard': { ...demo, currentBalance: 120, expenses: lateRent },
  vide: emptyBudgetState,
  'sans-echeance': { ...emptyBudgetState, currentBalance: 500, balanceDate: today },
};
