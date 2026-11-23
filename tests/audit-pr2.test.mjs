import assert from 'node:assert/strict';
import { test } from 'node:test';
import { passedOccurrences, updateBalance } from '../lib/balance-update.ts';
import { reduceBudget } from '../lib/budget-reducer.ts';
import { deserializeBudget, emptyBudgetState, recordPayment, serializeBudget } from '../lib/budget-state.ts';
import { diffHousehold } from '../lib/household-diff.ts';
import { materializeHousehold } from '../lib/household-materialize.ts';
import { expenseOccurrences, forecastOccurrences } from '../lib/occurrences.ts';
import { analyzeMonth } from '../lib/spending-analysis.ts';

const today = '2026-11-23';
const state = { ...emptyBudgetState, currentBalance: 400, balanceDate: '2026-11-20' };
const debt = {
  id: 'dette', creditor: 'Créancier', type: 'personal', initialAmount: 175.30,
  remainingAmount: 75.30, monthlyPayment: 100, nextDueDate: today,
  status: 'to_pay', isMediationIncluded: false,
};
const expense = {
  id: 'charge', label: 'Électricité', category: 'energy', amount: 40, frequency: 'monthly',
  dueDate: today, isPaid: false, isRecurring: true,
};

const pay = (budget, type, id, balanceIncludesPayment = false) =>
  recordPayment(budget, { type, id, today, dueDate: today, balanceIncludesPayment });
const roundTrip = budget => deserializeBudget(serializeBudget(budget));

test('C02 · dernière mensualité : solde, historique et analyse conservent 75,30 €', () => {
  const paid = roundTrip(pay({ ...state, debts: [debt] }, 'debt', debt.id));
  assert.equal(paid.currentBalance, 324.70);
  assert.equal(paid.debts[0].remainingAmount, 0);
  assert.equal(analyzeMonth(paid, '2026-11').totalCents, 7530);
  assert.equal(paid.debts[0].occurrenceAmountsCents[today], 7530);
  assert.deepEqual(pay(paid, 'debt', debt.id), paid);
});

test('C03 · modifier le montant d’une charge ne modifie pas ses échéances réglées', () => {
  const paid = pay({ ...state, expenses: [expense] }, 'expense', expense.id, true);
  const edited = roundTrip({ ...paid, expenses: [{ ...paid.expenses[0], amount: 60 }] });
  assert.equal(edited.currentBalance, 400);
  assert.equal(analyzeMonth(edited, '2026-11').totalCents, 4000);
  assert.equal(expenseOccurrences(edited.expenses[0], '2026-12-01', '2026-12-31')[0].amountCents, -6000);
});

test('C02/C03 · lecture des historiques sans montant par échéance', () => {
  const legacy = roundTrip({
    ...state,
    expenses: [{ ...expense, isPaid: true }],
    debts: [{ ...debt, occurrenceStatuses: { [today]: 'paid' } }],
  });
  assert.equal(analyzeMonth(legacy, '2026-11').totalCents, 14000);
});

test('C03 · une charge réglée sur une ancienne version garde le montant affiché avant modification', () => {
  const previous = {
    ...state, lastBackupDate: null, storageStatus: 'ready', storageRevision: 0,
    expenses: [{ ...expense, isPaid: true, occurrenceStatuses: { '2026-10-23': 'paid' } }],
  };
  const edited = reduceBudget(previous, {
    type: 'UPDATE_EXPENSE', payload: { id: expense.id, data: { amount: 60, isPaid: false } },
  });
  assert.equal(analyzeMonth(edited, '2026-10').totalCents, 4000);
  assert.equal(analyzeMonth(edited, '2026-11').totalCents, 4000);
  assert.equal(expenseOccurrences(edited.expenses[0], '2026-12-01', '2026-12-31')[0].amountCents, -6000);
});

test('C04 · rentrée passée proposée, marquée comme reçue sans modifier le rapprochement', () => {
  const income = {
    id: 'mutuelle', label: 'Mutuelle', type: 'mutual_insurance', amount: 500,
    frequency: 'one_time', expectedDate: '2026-11-21', isConfirmed: true,
  };
  const budget = {
    ...state, incomes: [
      income,
      { ...income, id: 'non-confirmee', isConfirmed: false },
      { ...income, id: 'ancienne', expectedDate: '2026-11-20' },
      { ...income, id: 'reglee', occurrenceStatuses: { '2026-11-21': 'paid' } },
      { ...income, id: 'annulee', occurrenceStatuses: { '2026-11-21': 'cancelled' } },
    ],
  };
  assert.deepEqual(forecastOccurrences(budget.incomes, [], [], [], today, today), []);
  assert.deepEqual(passedOccurrences(budget, today).map(({ id, dueDate, sinceLastBalance }) => [id, dueDate, sinceLastBalance]),
    [['mutuelle', '2026-11-21', true]]);
  const checked = { id: 'mutuelle', type: 'income', dueDate: '2026-11-21' };
  const updated = roundTrip(updateBalance(budget, { amount: 900, today, settled: [checked, checked] }));
  assert.equal(updated.currentBalance, 900);
  assert.equal(updated.incomes[0].occurrenceStatuses['2026-11-21'], 'paid');
  assert.equal(updated.incomes[0].occurrenceAmountsCents['2026-11-21'], 50000);
  assert.deepEqual(updated.balanceGaps ?? [], []);
});

test('Foyer · l’échéance transporte le montant payé et garde son effet sur un seul relevé', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const rows = [
    { seq: 1, record: { kind: 'checkpoint', id, data: { checkpointId: id, amount: 40000, date: today } } },
    { seq: 2, record: { kind: 'debt', id: debt.id, data: { ...debt, initialAmount: 17530, remainingAmount: 7530, monthlyPayment: 10000 } } },
  ];
  const before = materializeHousehold(rows);
  const paid = pay(before, 'debt', debt.id);
  const changes = diffHousehold(before, paid, { rows, paymentDate: today });
  const occurrence = changes.find(({ kind }) => kind === 'occurrence');
  assert.equal(occurrence.data.amountCents, 7530);
  assert.deepEqual(occurrence.balanceEffect, { checkpointId: id, deltaCents: -7530 });
  const nextRows = rows.concat(changes.map((record, index) => ({ seq: index + 3, record })));
  const restored = materializeHousehold(nextRows);
  assert.equal(restored.currentBalance, 324.70);
  assert.equal(analyzeMonth(restored, '2026-11').totalCents, 7530);
  const edited = { ...restored, debts: [{ ...restored.debts[0], monthlyPayment: 120 }] };
  assert.deepEqual(diffHousehold(restored, edited, { rows: nextRows }).map(({ kind }) => kind), ['debt']);
});

test('Foyer · compléter un ancien paiement conserve son débit et sa date', () => {
  const id = '00000000-0000-4000-8000-000000000002';
  const payDate = '2026-11-24';
  const rows = [
    { seq: 1, record: { kind: 'checkpoint', id, data: { checkpointId: id, amount: 40000, date: today } } },
    { seq: 2, record: { kind: 'expense', id: expense.id, data: { ...expense, amount: 4000 } } },
    { seq: 3, record: {
      kind: 'occurrence', id: `expense|${expense.id}|${today}`,
      data: { entityKind: 'expense', entityId: expense.id, dueDate: today, status: 'paid', paymentDate: payDate },
      balanceEffect: { checkpointId: id, deltaCents: -4000 },
    } },
  ];
  const previous = materializeHousehold(rows);
  const edited = reduceBudget({ ...previous, lastBackupDate: null, storageStatus: 'ready', storageRevision: 0 }, {
    type: 'UPDATE_EXPENSE', payload: { id: expense.id, data: { amount: 60 } },
  });
  const changes = diffHousehold(previous, edited, { rows });
  const updated = changes.find(({ kind }) => kind === 'occurrence');
  assert.equal(updated.data.amountCents, 4000);
  assert.equal(updated.data.paymentDate, payDate);
  assert.deepEqual(updated.balanceEffect, rows[2].record.balanceEffect);
  const restored = materializeHousehold(rows.concat(changes.map((record, index) => ({ seq: index + 4, record }))));
  assert.equal(restored.currentBalance, 360);
  assert.equal(restored.balanceDate, payDate);
  assert.equal(analyzeMonth(restored, '2026-11').totalCents, 4000);
});
