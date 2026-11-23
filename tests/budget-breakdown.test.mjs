import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateTotalMonthlyExpenses, monthlyChargesByCategory } from '../lib/budget-calculations.ts';
import { chartParts } from '../lib/chart-parts.ts';
import { mockExpenses } from '../lib/mock-data.ts';
import { toCents } from '../lib/money.ts';

test('Lot 4 · la répartition des charges programmées reprend la normalisation du résumé', () => {
  const rows = monthlyChargesByCategory(mockExpenses);
  assert.equal(rows.reduce((sum, { cents }) => sum + cents, 0), toCents(calculateTotalMonthlyExpenses(mockExpenses)));
  assert.ok(rows.every(({ cents }, index) => index === 0 || rows[index - 1].cents >= cents), 'du plus grand au plus petit');
  assert.ok(rows.every(({ cents }) => cents > 0));
});

test('Lot 4 · les parts du graphique gardent le total exact et regroupent le reste dans « Autres »', () => {
  const rows = [500, 300, 120, 50, 20, 10].map((cents, index) => ({ cents, name: `c${index}` }));
  const parts = chartParts(rows, ({ name }) => name);
  assert.deepEqual(parts.map(({ label, cents }) => [label, cents]), [['c0', 500], ['c1', 300], ['c2', 120], ['c3', 50], ['Autres', 30]]);
  assert.equal(parts.reduce((sum, { cents }) => sum + cents, 0), 1000);
  assert.equal(parts.reduce((sum, { share }) => sum + share, 0).toFixed(6), '1.000000');
  // Cinq parts tiennent sans regroupement ; un total nul ne produit aucune part.
  assert.equal(chartParts(rows.slice(0, 5), ({ name }) => name).length, 5);
  assert.deepEqual(chartParts([{ cents: 0 }], () => 'x'), []);
});
