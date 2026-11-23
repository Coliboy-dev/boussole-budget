import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deserializeBudget, emptyBudgetState } from '../lib/budget-state.ts';
import { exportHouseholdCopy, HOUSEHOLD_COPY_FORMAT } from '../lib/household-copy-export.ts';

const budget = { ...emptyBudgetState, currentBalance: 500, balanceDate: '2026-11-20' };

test('PR 5b · l’export d’une copie de foyer est une enveloppe distincte, refusée par la restauration du budget Personnel', () => {
  const contents = exportHouseholdCopy(budget, '2026-11-23T10:00:00Z', '2026-11-24T08:00:00Z');
  const exported = JSON.parse(contents);
  assert.equal(exported.format, HOUSEHOLD_COPY_FORMAT);
  assert.equal(exported.version, 1);
  assert.equal(exported.leftAt, '2026-11-23T10:00:00Z');
  assert.equal(Object.hasOwn(exported, 'state'), false);
  assert.throws(() => deserializeBudget(contents), /ne contient pas de sauvegarde/);
  // Le contenu reste lisible avec le format de Sauvegarde, pour un usage volontaire ultérieur.
  assert.equal(deserializeBudget(JSON.stringify(exported.budget)).currentBalance, 500);
});
