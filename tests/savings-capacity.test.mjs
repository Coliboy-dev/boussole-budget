import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateAdvice } from '../lib/advice-engine.ts';
import { assessGoalFeasibility, calculateBudgetSummary, calculateGoalTotals, monthlyChargesByCategory } from '../lib/budget-calculations.ts';
import { emptyBudgetState } from '../lib/budget-state.ts';
import { goalOccurrences } from '../lib/goals.ts';
import { analyzeMonth } from '../lib/spending-analysis.ts';

const today = '2026-11-23';
const income = (data = {}) => ({
  id: 'salaire', label: 'Salaire', type: 'salary', frequency: 'monthly',
  expectedDate: '2026-10-01', isConfirmed: true, amount: 100, ...data,
});
const expense = (data = {}) => ({
  id: 'charge', label: 'Charge', category: 'rent', frequency: 'monthly',
  dueDate: '2026-10-01', isRecurring: true, isPaid: false, amount: 80, ...data,
});
const goal = (data = {}) => ({
  id: 'objectif', label: 'Objectif', targetAmount: 500, savedAmount: 0,
  monthlyContribution: 90, onCurrentAccount: false, status: 'realistic', ...data,
});

test('C06 · un objectif atteint libère les 100 € de marge', () => {
  const goals = [goal({ savedAmount: 500 })];
  const summary = calculateBudgetSummary(400, [income()], [], [], [], 0, goals, today);
  assert.equal(summary.savingsCapacity, 100);
  assert.equal(calculateGoalTotals(goals).monthly, 0);
});

test('C06 · le dernier effort est plafonné au reste, dans le budget et sur le badge', () => {
  const goals = [goal({ savedAmount: 470 })];
  const summary = calculateBudgetSummary(400, [income()], [], [], [], 0, goals, today);
  assert.equal(summary.savingsCapacity, 70);
  assert.equal(calculateGoalTotals(goals).monthly, 30);
  assert.equal(assessGoalFeasibility(goals[0], 100, today).status, 'realistic');
  const shortage = assessGoalFeasibility(goals[0], 25, today);
  assert.match(shortage.reason, /30,00\s*€\/mois.*25,00\s*€\/mois/);
  const advice = generateAdvice(summary, [income()], [], today).find(({ id }) => id === 'adv-savings');
  assert.match(advice?.message ?? '', /70,00\s*€\/mois/);
});

test('C07 · une mise de côté du mois avant le 30/11 suffit pour atteindre 20 €', () => {
  const plan = goal({ targetAmount: 20, monthlyContribution: 20, targetDate: '2026-11-30' });
  assert.deepEqual(goalOccurrences([plan], today, plan.targetDate).map(({ dueDate, amountCents }) => [dueDate, amountCents]),
    [[today, -2000]]);
  assert.equal(assessGoalFeasibility(plan, 100, today).status, 'realistic');
  assert.equal(assessGoalFeasibility({ ...plan, lastContributionMonth: '2026-11' }, 100, today).status, 'fragile');
});

test('C07 · la première mise de côté du mois suivant est comptée à la date cible incluse', () => {
  const plan = goal({ targetAmount: 20, monthlyContribution: 20, targetDate: '2026-12-01', lastContributionMonth: '2026-11' });
  assert.equal(assessGoalFeasibility(plan, 100, today).status, 'realistic');
});

test('C08 · une charge terminée libère la marge sans effacer son paiement historique', () => {
  const ended = expense({ endDate: '2026-10-01', occurrenceStatuses: { '2026-10-01': 'paid' }, occurrenceAmountsCents: { '2026-10-01': 8000 } });
  const summary = calculateBudgetSummary(400, [income()], [ended], [], [], 0, [], today);
  assert.equal(summary.savingsCapacity, 100);
  assert.equal(summary.totalMonthlyExpenses, 0);
  assert.deepEqual(monthlyChargesByCategory([ended], today), []);
  assert.equal(analyzeMonth({ ...emptyBudgetState, expenses: [ended] }, '2026-10').totalCents, 8000);
});

test('C08 · seuls les revenus et charges encore actifs et les dettes non soldées comptent', () => {
  const incomes = [income({ endDate: today }), income({ id: 'fini', amount: 200, endDate: '2026-11-22' })];
  const expenses = [expense({ endDate: today, amount: 20 })];
  const debt = { creditor: 'Créancier fictif', type: 'personal', initialAmount: 200, remainingAmount: 0, status: 'to_pay', monthlyPayment: 60, isMediationIncluded: false };
  const debts = [{ ...debt, id: 'zero' }, { ...debt, id: 'terminee', status: 'completed', remainingAmount: 100 }];
  const summary = calculateBudgetSummary(400, incomes, expenses, debts, [], 0, [], today);
  assert.deepEqual([summary.totalMonthlyIncome, summary.totalMonthlyExpenses, summary.totalMonthlyDebts, summary.savingsCapacity], [100, 20, 0, 80]);
});
