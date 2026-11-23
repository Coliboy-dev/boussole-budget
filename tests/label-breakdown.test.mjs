import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelBreakdown, labelKey, labelSuggestions } from '../lib/label-breakdown.ts';
import { analyzeMonth } from '../lib/spending-analysis.ts';
import { scenarios } from './browser/budget-scenarios.mjs';

const spending = (id, date, amount, category, label) => ({
  id, date, amount, category, ...(label && { label }), balanceIncluded: false, debited: true, balanceRevision: 0,
});
// Budget sans charges ni dettes : seules les dépenses encodées comptent.
const state = (spendings) => ({ ...scenarios['sans-echeance'], expenses: [], debts: [], balanceGaps: [], spendings });
const may = '2026-05';

test('Par libellé · casse, accents et espaces ignorés ; orthographe la plus fréquente', () => {
  assert.equal(labelKey('  Café  du   boulot '), labelKey('cafe du boulot'));
  const { rows, categoryCents } = labelBreakdown(state([
    spending('a', '2026-05-04', 2.5, 'other', 'Café'),
    spending('b', '2026-05-05', 2.5, 'other', 'café '),
    spending('c', '2026-05-06', 2.5, 'other', 'cafe'),
    spending('d', '2026-05-06', 3.2, 'other', 'Café'),
    spending('e', '2026-05-07', 9.8, 'other', 'Tabac'),
    spending('f', '2026-05-08', 4, 'other'),
    spending('g', '2026-05-08', 50, 'groceries', 'Café'),
  ]), may, 'other', may);
  assert.deepEqual(rows.map(({ label, cents, count }) => [label, cents, count]),
    [['Café', 1070, 4], ['Tabac', 980, 1], ['Sans libellé', 400, 1]]);
  assert.equal(categoryCents, 2450);
  assert.equal(rows.reduce((sum, { cents }) => sum + cents, 0), categoryCents);
});

test('Par libellé · même total que la ligne « Autre » de l’analyse du mois', () => {
  const budget = state([
    spending('a', '2026-05-04', 2.5, 'other', 'Café'),
    spending('b', '2026-05-09', 11.4, 'other', 'Bonbons'),
    spending('c', '2026-05-11', 7.15, 'other'),
  ]);
  const row = analyzeMonth(budget, may).rows.find(({ category }) => category === 'other');
  assert.equal(labelBreakdown(budget, may, 'other', may).categoryCents, row.cents);
});

test('Par libellé · par an : moyenne des mois complets tenus, jamais le mois en cours', () => {
  const budget = state([
    spending('m1', '2026-05-02', 100, 'other', 'Café'), // mois en cours : ignoré pour l'estimation
    spending('a1', '2026-04-10', 40, 'other', 'Café'),
    spending('a2', '2026-04-12', 30, 'groceries'),
    spending('r1', '2026-03-10', 20, 'other', 'café'),
    // Février : aucune dépense encodée, le mois n'est pas compté.
  ]);
  const [cafe] = labelBreakdown(budget, may, 'other', may).rows;
  assert.equal(cafe.yearlyCents, Math.round(((4000 + 2000) / 2) * 12));
  // Un mois sans café mais tenu compte comme zéro.
  const withApril = state([...budget.spendings.filter(({ id }) => id !== 'a1'), spending('a3', '2026-04-11', 5, 'other', 'Tabac')]);
  assert.equal(labelBreakdown(withApril, may, 'other', may).rows[0].yearlyCents, Math.round(((0 + 2000) / 2) * 12));
  // Mois passé complet : il entre dans sa propre moyenne.
  const [april] = labelBreakdown(budget, '2026-04', 'other', may).rows;
  assert.equal(april.yearlyCents, Math.round(((4000 + 2000) / 2) * 12));
  // Premier mois d'utilisation : pas d'estimation.
  assert.equal(labelBreakdown(state([spending('x', '2026-05-02', 3, 'other', 'Café')]), may, 'other', may).rows[0].yearlyCents, null);
});

test('Par libellé · cinq libellés puis « N autres libellés », total exact', () => {
  const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const budget = state(labels.map((label, index) => spending(label, '2026-05-10', 10 - index, 'other', label)));
  const { rows, categoryCents } = labelBreakdown(budget, may, 'other', may);
  assert.deepEqual(rows.map(({ label, rest }) => [label, rest ?? false]),
    [['A', false], ['B', false], ['C', false], ['D', false], ['E', false], ['3 autres libellés', true]]);
  assert.equal(rows.reduce((sum, { cents }) => sum + cents, 0), categoryCents);
  // Six libellés tiennent sans regroupement d'un seul.
  assert.equal(labelBreakdown(state(budget.spendings.slice(0, 6)), may, 'other', may).rows.length, 6);
});

test('Suggestions de libellés · sans doublon, ceux de la catégorie choisie d’abord', () => {
  const budget = state([
    spending('a', '2026-05-04', 2.5, 'other', 'Café'),
    spending('b', '2026-05-05', 2.5, 'other', 'cafe'),
    spending('c', '2026-05-06', 30, 'groceries', 'Colruyt'),
    spending('d', '2026-05-07', 30, 'groceries', 'Colruyt'),
    spending('e', '2026-05-08', 30, 'groceries', 'Colruyt'),
    spending('f', '2026-01-08', 30, 'other', 'Très ancien'),
  ]);
  assert.deepEqual(labelSuggestions(budget, 'other', '2026-05-29'), ['Café', 'Colruyt']);
  assert.deepEqual(labelSuggestions(budget, 'groceries', '2026-05-29'), ['Colruyt', 'Café']);
});
