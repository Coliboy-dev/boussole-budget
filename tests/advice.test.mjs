import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateAdvice } from '../lib/advice-engine.ts';
import { calculateBudgetSummary } from '../lib/budget-calculations.ts';

const today = '2026-11-20';

function income(id, amount, expectedDate, changes = {}) {
  return { id, label: id, type: 'other', amount, expectedDate, frequency: 'one_time', isConfirmed: false, ...changes };
}

test('P2-7 — le conseil chiffre les versements incertains encore ouverts dans la projection', () => {
  const incomes = [
    income('aujourdhui', 0.10, today),
    income('fin-de-periode', 0.20, '2026-12-25'),
    income('apres-la-periode', 80, '2026-12-26'),
    income('encaisse', 90, '2026-11-23', { occurrenceStatuses: { '2026-11-23': 'paid' } }),
    income('annule', 100, '2026-11-24', { occurrenceStatuses: { '2026-11-24': 'cancelled' } }),
    income('certain', 200, '2026-11-25', { isConfirmed: true }),
    income('sans-date', 300, undefined),
  ];
  const summary = calculateBudgetSummary(500, incomes, [], [], [], 50, [], today);
  const advice = generateAdvice(summary, incomes, [], today).find(({ id }) => id === 'adv-income-confirm');

  assert.match(advice?.message ?? '', /2 versements incertains.*0,30\s*€/);
  assert.equal(summary.trueAvailable, 450);
});

test('P2-7 — le conseil d’épargne cite la capacité mensuelle et le disponible qui bornent la suggestion', () => {
  const incomes = [income('salaire', 1000, '2026-11-25', { isConfirmed: true, frequency: 'monthly' })];
  const expenses = [{
    id: 'loyer', label: 'Loyer', category: 'rent', amount: 700, frequency: 'monthly',
    dueDate: '2026-11-21', isRecurring: true, isPaid: false,
  }];
  const summary = calculateBudgetSummary(800, incomes, expenses, [], [], 50, [], today);
  const advice = generateAdvice(summary, incomes, [], today).find(({ id }) => id === 'adv-savings');

  assert.equal(summary.savingsCapacity, 300);
  assert.equal(summary.trueAvailable, 50);
  assert.match(advice?.message ?? '', /300,00\s*€\/mois.*50,00\s*€.*15,00\s*€/);
});

test('P2-7 — les conseils sur les dettes affichent le nombre de dossiers concernés', () => {
  const base = {
    creditor: 'Créancier fictif', type: 'personal', initialAmount: 100, remainingAmount: 100,
    monthlyPayment: 20, isMediationIncluded: false,
  };
  const debts = [
    { ...base, id: 'retard', status: 'late', nextDueDate: '2026-11-19' },
    { ...base, id: 'contestation-1', status: 'contested' },
    { ...base, id: 'contestation-2', status: 'contested' },
    { ...base, id: 'soldee', status: 'completed', nextDueDate: '2026-11-19' },
  ];
  const summary = calculateBudgetSummary(500, [], [], debts, [], 50, [], today);
  const advice = generateAdvice(summary, [], debts, today);

  assert.match(advice.find(({ id }) => id === 'adv-late-debts')?.message ?? '', /1 dette en retard/);
  assert.match(advice.find(({ id }) => id === 'adv-contested')?.message ?? '', /2 dettes contestées/);
});
