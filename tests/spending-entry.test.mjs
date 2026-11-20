import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBudgetSummary } from '../lib/budget-calculations.ts';
import { emptyBudgetState } from '../lib/budget-state.ts';
import { buildProjection } from '../lib/projection.ts';
import { parseQuickEntry } from '../lib/quick-entry.ts';
import { envelopesOf, replaceExpenseWithEnvelope, spendingsOf } from '../lib/spending.ts';

process.env.TZ = 'Europe/Brussels';

test('P3-2 — la saisie rapide accepte les séparateurs de milliers et le point final', () => {
  assert.deepEqual(parseQuickEntry('1 234,50 loyer'), { amount: 1234.5, label: 'loyer' });
  assert.deepEqual(parseQuickEntry('1.234,50'), { amount: 1234.5 });
  assert.deepEqual(parseQuickEntry('42.28.'), { amount: 42.28 });
});

test('P3-2 — un remplacement garde les 400 € saisis au lieu des 300 € de la charge', () => {
  const state = {
    ...emptyBudgetState,
    expenses: [{
      id: 'courses', label: 'Courses', category: 'groceries', amount: 300, frequency: 'monthly',
      dueDate: '2026-12-20', isPaid: false, isRecurring: true,
    }],
  };
  const replaced = replaceExpenseWithEnvelope(state, 'courses', 'groceries', 400);
  assert.deepEqual(replaced.expenses, []);
  assert.equal(envelopesOf(replaced).length, 1);
  assert.equal(envelopesOf(replaced)[0].monthlyAmount, 400);
});

test('P3-2 — le point bas inclut les enveloppes et les dépenses déjà encodées', () => {
  const today = '2026-12-10';
  const budget = {
    ...emptyBudgetState,
    currentBalance: 1000,
    envelopes: [{ id: 'courses', category: 'groceries', label: 'Courses', monthlyAmount: 400 }],
    spendings: [{
      id: 'achat', date: '2026-12-05', category: 'groceries', amount: 150,
      balanceIncluded: false, debited: true, balanceRevision: 0,
    }],
  };
  const options = { today, horizon: 35, envelopes: envelopesOf(budget), spendings: spendingsOf(budget) };
  const projection = buildProjection(1000, [], [], [], [], 50, options);
  const summary = calculateBudgetSummary(1000, [], [], [], [], 50, [], today, options);
  assert.equal(projection.lowestBalance, 350);
  assert.equal(projection.available, 300);
  assert.equal(projection.available, summary.trueAvailable);
  assert.deepEqual(projection.events.map(({ type, amount }) => [type, amount]), [
    ['envelope', -250],
    ['envelope', -400],
  ]);
});
