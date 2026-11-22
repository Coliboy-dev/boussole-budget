import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyBudgetState, recordPayment } from '../lib/budget-state.ts';
import { updateBalance } from '../lib/balance-update.ts';
import { addSpending, deleteSpending, updateSpending } from '../lib/spending.ts';
import { diffHousehold } from '../lib/household-diff.ts';
import { materializeHousehold } from '../lib/household-materialize.ts';

process.env.TZ = 'Europe/Brussels';
const date = '2026-11-22';
const checkpointId = '00000000-0000-4000-8000-000000000001';
const initial = [{ seq: 1, record: { kind: 'checkpoint', id: checkpointId, data: { checkpointId, amount: 50000, date } } }];
const rent = { id: 'loyer', label: 'Loyer', amount: 100, frequency: 'monthly', isRecurring: true, isPaid: false, dueDate: date, category: 'rent' };
const payment = { type: 'expense', id: rent.id, dueDate: date, today: date, balanceIncludesPayment: false };

function append(rows, records) {
  const seq = Math.max(0, ...rows.map(row => row.seq));
  return rows.concat(records.map((record, index) => ({ seq: seq + index + 1, record })));
}

test('Le moteur émet un seul élément pour une échéance payée et le retrait de cet élément annule son débit', () => {
  const empty = materializeHousehold(initial);
  const rows = append(initial, diffHousehold(empty, { ...empty, expenses: [rent] }, { rows: initial }));
  const before = materializeHousehold(rows);
  const paidA = diffHousehold(before, recordPayment(before, payment), { rows, paymentDate: date });
  const paidB = diffHousehold(before, recordPayment(before, payment), { rows, paymentDate: date });
  assert.equal(paidA.length, 1);
  assert.deepEqual(paidA[0].balanceEffect, { checkpointId, deltaCents: -10000 });
  const received = append(append(rows, paidA), paidB);
  const paid = materializeHousehold(received);
  assert.equal(paid.currentBalance, 400);
  assert.equal(paid.expenses[0].occurrenceStatuses[date], 'paid');
  const undo = diffHousehold(paid, before, { rows: received });
  assert.equal(undo.length, 1);
  assert.equal(undo[0].balanceEffect, undefined);
  assert.equal(materializeHousehold(append(received, undo)).currentBalance, 500);
});

test('Les corrections d’une même dépense transportent son débit complet et sa suppression le retire', () => {
  const before = materializeHousehold(initial);
  const spending = { id: 'courses', amount: 20, category: 'groceries', date, balanceIncluded: false };
  const rows = append(initial, diffHousehold(before, addSpending(before, spending, date), { rows: initial }));
  const saved = materializeHousehold(rows);
  const edits = [30, 40].map(amount => diffHousehold(saved, updateSpending(saved, spending.id, { amount }, date), { rows }));
  assert.equal(edits[0][0].balanceEffect.deltaCents, -3000);
  assert.equal(edits[1][0].balanceEffect.deltaCents, -4000);
  const received = append(append(rows, edits[0]), edits[1]);
  const final = materializeHousehold(received);
  assert.equal(final.currentBalance, 460);
  assert.equal(final.spendings[0].amount, 40);
  const removed = diffHousehold(final, deleteSpending(final, spending.id), { rows: received });
  assert.deepEqual(removed, [{ kind: 'spending', id: spending.id }]);
  assert.equal(materializeHousehold(append(received, removed)).currentBalance, 500);
});

test('La recopie marque les échéances déjà comprises et le nouveau relevé prend la main', () => {
  const empty = materializeHousehold(initial);
  const rows = append(initial, diffHousehold(empty, { ...empty, expenses: [rent] }, { rows: initial }));
  const before = materializeHousehold(rows);
  const reviewed = updateBalance(before, { amount: 400, today: date, settled: [payment] });
  const changes = diffHousehold(before, reviewed, { rows, newCheckpointId: '00000000-0000-4000-8000-000000000002' });
  assert.equal(changes.find(record => record.kind === 'occurrence').balanceEffect, undefined);
  const after = materializeHousehold(append(rows, changes));
  assert.equal(after.currentBalance, 400);
  assert.equal(after.expenses[0].occurrenceStatuses[date], 'paid');
});

test('La matérialisation conserve la date du paiement retenu avec le solde calculé', () => {
  const empty = materializeHousehold(initial);
  const rows = append(initial, diffHousehold(empty, { ...empty, expenses: [rent] }, { rows: initial }));
  const before = materializeHousehold(rows);
  const dateOfPayment = '2026-11-23';
  const paid = recordPayment(before, { ...payment, today: dateOfPayment });
  const changes = diffHousehold(before, paid, { rows, paymentDate: dateOfPayment });
  assert.equal(materializeHousehold(append(rows, changes)).balanceDate, paid.balanceDate);
});

test('La représentation partagée ignore les coordonnées et le dossier personnel', () => {
  const before = materializeHousehold([]);
  const next = {
    ...emptyBudgetState,
    userProfile: { ...emptyBudgetState.userProfile, firstName: 'Privé', safetyReserve: 60 },
    mediationFile: { ...emptyBudgetState.mediationFile, mediatorName: 'Contact privé' },
  };
  const changes = diffHousehold(before, next, { rows: [] });
  assert.deepEqual(changes, [{ kind: 'settings', id: 'settings', data: { safetyReserve: 6000 } }]);
});
