import assert from 'node:assert/strict';
import { test } from 'node:test';
import { savingsTip } from '../lib/savings-tip.ts';
import { scenarios } from './browser/budget-scenarios.mjs';

const today = '2026-05-29';
const spending = (id, date, amount, category, label) => ({
  id, date, amount, category, ...(label && { label }), balanceIncluded: false, debited: true, balanceRevision: 0,
});
const state = (spendings) => ({ ...scenarios['sans-echeance'], spendings });
const days = (prefix, list, amount, category, label) => list.map((day) =>
  spending(`${prefix}${day}`, `2026-05-${String(day).padStart(2, '0')}`, amount, category, label));

test('Piste d’économie · la dépense répétée la plus coûteuse des 30 derniers jours, hors essentiels', () => {
  const tip = savingsTip(state([
    ...days('c', [4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 18, 19], 2.8, 'other', 'Café'),
    ...days('cc', [20, 21], 2.8, 'other', 'café'),
    ...days('t', [2, 9, 16], 9.8, 'other', 'Tabac'),
    ...days('g', [3, 10, 17, 24], 60, 'groceries', 'Colruyt'), // essentiel : jamais proposé
  ]), today);
  assert.deepEqual(tip, { label: 'Café', category: 'other', count: 14, total: 39.2, yearly: 470.4, halfPerMonth: 19.6 });
});

test('Piste d’économie · pas d’habitude, pas de conseil', () => {
  assert.equal(savingsTip(state([]), today), null);
  // Achat isolé, même cher : pas une habitude.
  assert.equal(savingsTip(state([spending('x', '2026-05-20', 90, 'leisure', 'Concert')]), today), null);
  // Habitude trop petite pour valoir la peine (moins de 10 €).
  assert.equal(savingsTip(state(days('b', [3, 4, 5], 1, 'other', 'Bonbons')), today), null);
  // Hors des 30 derniers jours.
  assert.equal(savingsTip(state([spending('a', '2026-04-20', 5, 'other', 'Café'), spending('b', '2026-04-21', 5, 'other', 'Café'),
    spending('c', '2026-04-22', 5, 'other', 'Café')]), today), null);
  // « Autre » sans libellé : rien d'actionnable.
  assert.equal(savingsTip(state(days('o', [3, 4, 5, 6], 8, 'other')), today), null);
});

test('Piste d’économie · une catégorie sans libellé compte comme une habitude (restaurants)', () => {
  const tip = savingsTip(state(days('r', [3, 10, 17, 24], 12.5, 'restaurants')), today);
  assert.deepEqual([tip.label, tip.count, tip.total], ['Restaurants et snacks', 4, 50]);
});
