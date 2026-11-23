import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deserializeBudget, serializeBudget } from '../lib/budget-state.ts';
import { selectableSpendingCategories, spendingCategoryLabels, withCurrent } from '../lib/spending.ts';
import { scenarios } from './browser/budget-scenarios.mjs';

const newSpending = ['pets', 'gifts', 'beauty', 'travel'];
const newCharges = ['alimony', 'taxes', 'childcare'];

test('Catégories · toutes les catégories de dépenses et de charges sont lues (stockage, copie en ligne, Foyer)', () => {
  const base = scenarios['sans-echeance'];
  const spendingCategories = Object.keys(spendingCategoryLabels);
  const state = {
    ...base,
    spendings: spendingCategories.map((category, index) => ({
      id: `s${index}`, date: '2026-05-10', amount: 1 + index, category, balanceIncluded: false, debited: true, balanceRevision: 0,
    })),
    envelopes: spendingCategories.map((category, index) => ({ id: `e${index}`, category, label: category, monthlyAmount: 10 })),
    merchantCategories: Object.fromEntries(spendingCategories.map((category) => [`commerce-${category}`, category])),
    expenses: [...base.expenses, ...newCharges.map((category, index) => ({
      id: `c${index}`, label: category, category, amount: 50, frequency: 'monthly', dueDate: '2026-06-05', isPaid: false, isRecurring: true,
    }))],
  };
  const restored = deserializeBudget(serializeBudget(state));
  assert.deepEqual(restored.spendings.map(({ category }) => category), spendingCategories);
  assert.deepEqual(restored.expenses.slice(-3).map(({ category }) => category), newCharges);
  for (const category of newSpending) assert.ok(spendingCategories.includes(category), category);
});

test('Catégories · deuxième mise en ligne : les nouvelles catégories sont proposées à la saisie', () => {
  for (const category of newSpending) assert.ok(selectableSpendingCategories.includes(category), category);
  assert.equal(spendingCategoryLabels.leisure, 'Loisirs, sport et sorties');
});

test('Catégories · la catégorie d’un élément modifié est toujours gardée', () => {
  assert.deepEqual(withCurrent(['a', 'b'], 'c'), ['a', 'b', 'c']);
  assert.deepEqual(withCurrent(['a', 'b'], 'a'), ['a', 'b']);
  assert.deepEqual(withCurrent(['a', 'b'], ''), ['a', 'b']);
});
