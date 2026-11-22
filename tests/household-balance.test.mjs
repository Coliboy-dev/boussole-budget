import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyBudgetState } from '../lib/budget-state.ts';
import { createHouseholdCheckpoint, materializeHouseholdBalance } from '../lib/household-balance.ts';
import { deleteSpending } from '../lib/spending.ts';

const day = '2026-11-22';
const old = { checkpointId: '00000000-0000-4000-8000-000000000001', amount: 50000, date: day, seq: 1 };
const readingA = { checkpointId: '00000000-0000-4000-8000-000000000002', amount: 45000, date: day };
const readingB = { checkpointId: '00000000-0000-4000-8000-000000000003', amount: 40000, date: '2026-11-21' };
const expense = {
  id: 'dépense-a', amount: 20, date: day, category: 'other', balanceIncluded: false, debited: true, balanceRevision: 2,
};
const mappings = new Map([[expense.id, readingA.checkpointId]]);
const state = { ...emptyBudgetState, spendings: [expense] };

test('Chaque recopie du solde crée un identifiant distinct même à montant et date égaux', () => {
  const first = createHouseholdCheckpoint(40000, day);
  const second = createHouseholdCheckpoint(40000, day);
  assert.match(first.checkpointId, /^[0-9a-f-]{36}$/);
  assert.notEqual(first.checkpointId, second.checkpointId);
  assert.deepEqual(first, { checkpointId: first.checkpointId, amount: 40000, date: day });
});

test('Deux dépenses distinctes issues du même relevé donnent 395 € quel que soit l’ordre de réception', () => {
  const effects = [
    { checkpointId: old.checkpointId, deltaCents: -6500 },
    { checkpointId: old.checkpointId, deltaCents: -4000 },
  ];
  assert.equal(materializeHouseholdBalance(emptyBudgetState, [old], effects, new Map()).currentBalance, 395);
  assert.equal(materializeHouseholdBalance(emptyBudgetState, [old], effects.toReversed(), new Map()).currentBalance, 395);
});

test('Deux relevés concurrents suivent l’ordre serveur même si la date saisie donne un ordre différent', () => {
  const effects = [{ checkpointId: readingA.checkpointId, deltaCents: -2000 }];
  const bLast = [old, { ...readingA, seq: 2 }, { ...readingB, seq: 4 }];
  const deviceA = materializeHouseholdBalance(state, bLast, effects, mappings);
  const deviceB = materializeHouseholdBalance(state, bLast.toReversed(), effects, mappings);
  assert.deepEqual(deviceA, deviceB);
  assert.equal(deviceA.currentBalance, 400);
  assert.equal(deviceA.balanceDate, readingB.date);
  assert.equal(deleteSpending(deviceA, expense.id).currentBalance, 400);

  const aLast = [old, { ...readingB, seq: 2 }, { ...readingA, seq: 3 }];
  const synced = materializeHouseholdBalance(state, aLast, effects, mappings);
  assert.deepEqual(synced, materializeHouseholdBalance(state, aLast.toReversed(), effects, mappings));
  assert.equal(synced.currentBalance, 430);
  assert.equal(deleteSpending(synced, expense.id).currentBalance, 450);
});
