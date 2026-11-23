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
const state = { ...emptyBudgetState, spendings: [expense] };

function checkpoint({ seq, ...data }) {
  return { seq, record: { kind: 'checkpoint', id: data.checkpointId, data } };
}

function operation(kind, id, seq, checkpointId, deltaCents, data = {}) {
  return { seq, record: { kind, id, data, balanceEffect: { checkpointId, deltaCents } } };
}

function paid(id, seq) {
  return operation('occurrence', id, seq, old.checkpointId, -10000, { status: 'paid' });
}

function balance(...rows) {
  return materializeHouseholdBalance(emptyBudgetState, rows).currentBalance;
}

test('Chaque recopie du solde crée un identifiant distinct même à montant et date égaux', () => {
  const first = createHouseholdCheckpoint(40000, day);
  const second = createHouseholdCheckpoint(40000, day);
  assert.match(first.checkpointId, /^[0-9a-f-]{36}$/);
  assert.notEqual(first.checkpointId, second.checkpointId);
  assert.deepEqual(first, { checkpointId: first.checkpointId, amount: 40000, date: day });
});

test('Deux dépenses distinctes issues du même relevé donnent 395 € quel que soit l’ordre de réception', () => {
  const rows = [
    checkpoint(old),
    operation('spending', 'courses-a', 2, old.checkpointId, -6500),
    operation('spending', 'courses-b', 3, old.checkpointId, -4000),
  ];
  assert.equal(balance(...rows), 395);
  assert.equal(balance(...rows.toReversed()), 395);
});

test('Deux relevés concurrents suivent l’ordre serveur même si la date saisie donne un ordre différent', () => {
  const spending = operation('spending', expense.id, 3, readingA.checkpointId, -2000);
  const bLast = [old, { ...readingA, seq: 2 }, { ...readingB, seq: 4 }].map(checkpoint).concat(spending);
  const deviceA = materializeHouseholdBalance(state, bLast);
  const deviceB = materializeHouseholdBalance(state, bLast.toReversed());
  assert.deepEqual(deviceA, deviceB);
  assert.equal(deviceA.currentBalance, 400);
  assert.equal(deviceA.balanceDate, readingB.date);
  assert.equal(deleteSpending(deviceA, expense.id).currentBalance, 400);

  const aLast = [old, { ...readingB, seq: 2 }, { ...readingA, seq: 3 }].map(checkpoint).concat({ ...spending, seq: 4 });
  const synced = materializeHouseholdBalance(state, aLast);
  assert.deepEqual(synced, materializeHouseholdBalance(state, aLast.toReversed()));
  assert.equal(synced.currentBalance, 430);
  assert.equal(deleteSpending(synced, expense.id).currentBalance, 450);
});

test('Deux marquages de la même échéance de 100 € donnent 400 € dans les deux ordres', () => {
  const first = paid('loyer', 2);
  const second = paid('loyer', 3);
  assert.equal(balance(checkpoint(old), first, second), 400);
  assert.equal(balance(second, checkpoint(old), first), 400);
});

test('Deux échéances distinctes de 100 € donnent 300 €', () => {
  assert.equal(balance(checkpoint(old), paid('loyer', 2), paid('énergie', 3)), 300);
});

test('Une annulation retire le débit si sa version gagne, même si le paiement arrive après', () => {
  const removed = { seq: 3, record: { kind: 'occurrence', id: 'loyer' } };
  assert.equal(balance(checkpoint(old), removed, paid('loyer', 2)), 500);
  assert.equal(balance(checkpoint(old), paid('loyer', 3), { ...removed, seq: 2 }), 400);
});

test('Une échéance rattachée à l’ancien relevé ne débite pas le nouveau', () => {
  assert.equal(balance(checkpoint(old), checkpoint({ ...readingB, seq: 3 }), paid('loyer', 2)), 400);
});

test('Deux corrections concurrentes de la même dépense remplacent aussi son effet, et la suppression le retire', () => {
  const first = operation('spending', 'courses', 2, old.checkpointId, -3000, { amount: 3000 });
  const last = operation('spending', 'courses', 3, old.checkpointId, -4000, { amount: 4000 });
  assert.equal(balance(checkpoint(old), last, first), 460);
  assert.equal(balance(checkpoint(old), first, last, { seq: 4, record: { kind: 'spending', id: 'courses' } }), 500);
});
