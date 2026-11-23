import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balanceFreshness, passedOccurrences, updateBalance } from '../lib/balance-update.ts';
import { calculateBudgetSummary } from '../lib/budget-calculations.ts';
import { emptyBudgetState, recordPayment } from '../lib/budget-state.ts';

process.env.TZ = 'Europe/Brussels';

// Le solde a été saisi le 25 novembre ; le loyer et la mensualité sont passés depuis.
const today = '2026-12-03';
const rent = {
  id: 'loyer', label: 'Loyer', category: 'rent', amount: 650, frequency: 'monthly',
  dueDate: '2026-12-01', isPaid: false, isRecurring: true,
};
const phone = {
  id: 'gsm', label: 'GSM', category: 'phone', amount: 25, frequency: 'monthly',
  dueDate: '2026-12-15', isPaid: false, isRecurring: true,
};
const debt = {
  id: 'ing', creditor: 'ING', type: 'personal', initialAmount: 1200, remainingAmount: 890,
  monthlyPayment: 50, status: 'to_pay', nextDueDate: '2026-12-02', isMediationIncluded: false,
};
const oldLate = {
  id: 'eau', label: 'Eau', category: 'energy', amount: 30, frequency: 'one_time',
  dueDate: '2026-11-20', isPaid: false, isRecurring: false,
};
const salary = {
  id: 'salaire', label: 'Salaire', type: 'salary', amount: 1430, frequency: 'monthly',
  isConfirmed: true, expectedDate: '2026-12-28',
};

const budget = {
  ...emptyBudgetState,
  currentBalance: 1000,
  balanceDate: '2026-11-25',
  userProfile: { ...emptyBudgetState.userProfile, safetyReserve: 50 },
  incomes: [salary],
  expenses: [rent, phone, oldLate],
  debts: [debt],
};

const available = (state) => calculateBudgetSummary(
  state.currentBalance, state.incomes, state.expenses, state.debts, state.childExpenses,
  state.userProfile.safetyReserve, state.goals, today,
).trueAvailable;

test('les échéances atteintes sont proposées ; celles d’après le dernier solde sont pré-cochées', () => {
  const passed = passedOccurrences(budget, today);
  assert.deepEqual(passed.map(({ id, dueDate, sinceLastBalance }) => [id, dueDate, sinceLastBalance]), [
    ['eau', '2026-11-20', false],
    ['loyer', '2026-12-01', true],
    ['ing', '2026-12-02', true],
  ]);
  assert.ok(passed.every(({ id }) => id !== 'gsm' && id !== 'salaire'), 'rien de futur n’est proposé');
});

test('nouveau solde + échéances confirmées = même disponible qu’un paiement saisi à la main', () => {
  const byHand = recordPayment(
    recordPayment(budget, { type: 'expense', id: 'loyer', dueDate: '2026-12-01', today, balanceIncludesPayment: false }),
    { type: 'debt', id: 'ing', dueDate: '2026-12-02', today, balanceIncludesPayment: false },
  );
  assert.equal(byHand.currentBalance, 300);

  const fromBank = updateBalance(budget, {
    amount: 300, today,
    settled: [{ type: 'expense', id: 'loyer', dueDate: '2026-12-01' }, { type: 'debt', id: 'ing', dueDate: '2026-12-02' }],
  });
  assert.equal(fromBank.currentBalance, 300);
  assert.equal(fromBank.balanceDate, today);
  assert.equal(fromBank.debts[0].remainingAmount, 840, 'la mensualité diminue le restant dû');
  assert.equal(available(fromBank), available(byHand));
});

test('sans confirmation, le loyer déjà prélevé serait déduit une seconde fois', () => {
  const settled = updateBalance(budget, {
    amount: 300, today,
    settled: [{ type: 'expense', id: 'loyer', dueDate: '2026-12-01' }, { type: 'debt', id: 'ing', dueDate: '2026-12-02' }],
  });
  const notSettled = updateBalance(budget, { amount: 300, today });
  assert.equal(Math.round((available(settled) - available(notSettled)) * 100), 70000, '650 € + 50 € comptés deux fois');
});

test('une échéance non cochée reste due et le solde n’est pas modifié par la confirmation', () => {
  const next = updateBalance(budget, { amount: 300, today, settled: [{ type: 'expense', id: 'loyer', dueDate: '2026-12-01' }] });
  assert.equal(next.currentBalance, 300);
  assert.deepEqual(passedOccurrences(next, today).map(({ id }) => id), ['eau', 'ing']);
  assert.ok(passedOccurrences(next, today).every(({ sinceLastBalance }) => !sinceLastBalance));
});

test('le solde est signalé comme ancien après trois jours ou dès qu’une échéance est passée', () => {
  assert.deepEqual(balanceFreshness(budget, today), { days: 8, passedSince: 2, stale: true });
  assert.deepEqual(balanceFreshness({ ...budget, expenses: [phone], debts: [], balanceDate: '2026-12-02' }, today),
    { days: 1, passedSince: 0, stale: false });
  assert.equal(balanceFreshness({ ...budget, expenses: [phone], debts: [], balanceDate: '2026-11-30' }, today).stale, true);
  assert.deepEqual(balanceFreshness({ ...budget, balanceDate: undefined }, today), { days: null, passedSince: 0, stale: false });
});

test('B01 · « Payé » ne déduit pas deux fois une charge déjà comprise dans le solde recopié', async () => {
  const { emptyBudgetState, paymentMayBeInBalance, recordPayment } = await import('../lib/budget-state.ts');
  const rent = { id: 'r', label: 'Loyer', category: 'rent', amount: 800, frequency: 'monthly', dueDate: '2026-05-05', isRecurring: true, isPaid: false };
  const state = { ...emptyBudgetState, currentBalance: 1200, balanceDate: '2026-05-10', expenses: [rent] };
  // Loyer dû le 5, solde recopié le 10 : il y figure peut-être, on demande.
  assert.equal(paymentMayBeInBalance('2026-05-05', '2026-05-10'), true);
  assert.equal(paymentMayBeInBalance('2026-05-10', '2026-05-10'), true);
  assert.equal(paymentMayBeInBalance('2026-05-11', '2026-05-10'), false);
  assert.equal(paymentMayBeInBalance('2026-05-05', undefined), false);
  // « Oui, déjà débité » : marqué payé, solde inchangé.
  const included = recordPayment(state, { type: 'expense', id: 'r', dueDate: '2026-05-05', today: '2026-05-12', balanceIncludesPayment: true });
  assert.deepEqual([included.currentBalance, included.balanceDate, included.expenses[0].occurrenceStatuses], [1200, '2026-05-10', { '2026-05-05': 'paid' }]);
  // « Non, déduis-le » : déduit une seule fois.
  const deducted = recordPayment(state, { type: 'expense', id: 'r', dueDate: '2026-05-05', today: '2026-05-12', balanceIncludesPayment: false });
  assert.deepEqual([deducted.currentBalance, deducted.balanceDate], [400, '2026-05-12']);
});
