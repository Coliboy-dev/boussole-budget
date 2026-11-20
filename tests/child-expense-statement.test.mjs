import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateSharedExpenseStatement } from '../lib/budget-calculations.ts';
import { deserializeBudget, emptyBudgetState, serializeBudget } from '../lib/budget-state.ts';

function expense(id, date, fields = {}) {
  return {
    id,
    date,
    label: id,
    category: 'school',
    totalAmount: 80,
    paidByUser: 60,
    shareAmount: 30,
    status: 'pending',
    receiptSent: false,
    ...fields,
  };
}

test('P2-5 — le relevé couvre les bornes du trimestre et conserve les statuts saisis', () => {
  const first = expense('Livres', '2026-10-01', { receiptReference: 'F-42' });
  const last = expense('Trajet', '2026-12-31', { status: 'reimbursed', receiptSent: true });
  const expenses = [
    last,
    expense('Ancien frais', '2026-09-30'),
    expense('Frais suivant', '2027-01-01'),
    expense('Sans part', '2026-11-05', { shareAmount: 0 }),
    first,
  ];

  const statement = calculateSharedExpenseStatement(expenses, '2026-11-20');

  assert.equal(statement.start, '2026-10-01');
  assert.equal(statement.end, '2026-12-31');
  assert.deepEqual(statement.items, [first, last]);
  assert.equal(expenses[0], last);
});

test('P2-5 — les totaux additionnent les parts et montants enregistrés au centime près', () => {
  const expenses = [
    expense('Premier', '2026-04-01', { totalAmount: 0.20, paidByUser: 0.20, shareAmount: 0.10 }),
    expense('Deuxième', '2026-06-30', { totalAmount: 0.50, paidByUser: 0.30, shareAmount: 0.20 }),
  ];
  const { totalAmount, paidByUser, shareAmount } = calculateSharedExpenseStatement(expenses, '2026-06-30');

  assert.deepEqual({ totalAmount, paidByUser, shareAmount }, { totalAmount: 0.70, paidByUser: 0.50, shareAmount: 0.30 });
  assert.deepEqual(calculateSharedExpenseStatement(expenses, '2026-07-01'), {
    start: '2026-07-01',
    end: '2026-09-30',
    items: [],
    totalAmount: 0,
    paidByUser: 0,
    shareAmount: 0,
  });
});

test('P2-5 — la sauvegarde garde la référence et accepte les anciens frais sans référence', () => {
  const referenced = expense('Facture', '2026-10-01', { receiptReference: 'École 2026/015' });
  const previous = expense('Vêtements', '2026-10-02');
  const contents = serializeBudget({ ...emptyBudgetState, childExpenses: [referenced, previous] });
  const restored = deserializeBudget(contents);

  assert.deepEqual(restored.childExpenses, [referenced, previous]);
  assert.equal(serializeBudget(restored), contents);
});
