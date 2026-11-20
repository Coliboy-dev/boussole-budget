import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateBalance } from '../lib/balance-update.ts';
import { calculateBudgetSummary } from '../lib/budget-calculations.ts';
import { deserializeBudget, emptyBudgetState, migrateLegacyBudget, serializeBudget } from '../lib/budget-state.ts';
import { spentInMonth } from '../lib/envelopes.ts';
import { merchantKey, suggestCategory } from '../lib/merchants.ts';
import { simulatePurchase } from '../lib/purchase-simulation.ts';
import { parseQuickEntry } from '../lib/quick-entry.ts';
import {
  addSpending,
  balanceGapsOf,
  balanceRevisionOf,
  deleteSpending,
  envelopesOf,
  merchantCategoriesOf,
  replaceExpenseWithEnvelope,
  spendingsOf,
  upsertEnvelope,
} from '../lib/spending.ts';
import { analyzeMonth } from '../lib/spending-analysis.ts';

process.env.TZ = 'Europe/Brussels';

const today = '2026-12-10';
const groceries = { id: 'courses', category: 'groceries', label: 'Courses', monthlyAmount: 400 };
const base = {
  ...emptyBudgetState,
  currentBalance: 1000,
  balanceDate: '2026-12-01',
  balanceRevision: 0,
  userProfile: { ...emptyBudgetState.userProfile, safetyReserve: 50 },
  envelopes: [groceries],
  spendings: [
    { id: 'courses-3', category: 'groceries', date: '2026-12-03', amount: 100, balanceIncluded: false, debited: true, balanceRevision: 0 },
    { id: 'courses-7', category: 'groceries', date: '2026-12-07', amount: 50, balanceIncluded: false, debited: true, balanceRevision: 0 },
  ],
};

function summary(state, day = today) {
  return calculateBudgetSummary(
    state.currentBalance, state.incomes, state.expenses, state.debts, state.childExpenses,
    state.userProfile.safetyReserve, state.goals, day,
    { envelopes: envelopesOf(state), spendings: spendingsOf(state) },
  );
}

function buyGroceries(state = base) {
  return addSpending(state, {
    id: 'courses-10', category: 'groceries', date: today, amount: 50, balanceIncluded: false,
  }, today);
}

function refreshBalance() {
  return updateBalance(buyGroceries(), { amount: 900, today });
}

test('P3-1 — 1. l’enveloppe réserve le reste de décembre et la totalité de janvier', () => {
  const result = summary(base);
  assert.equal(result.availableForecast.dailyBalances.at(-1).date, '2027-01-14');
  assert.equal(result.availableForecast.balance, 350);
  assert.equal(result.trueAvailable, 300);
});

test('P3-1 — 2. une dépense dans l’enveloppe débite le solde et réduit la réservation', () => {
  const state = buyGroceries();
  assert.equal(state.currentBalance, 950);
  assert.equal(state.balanceDate, '2026-12-01');
  assert.equal(summary(state).trueAvailable, 300);
});

test('P3-1 — 3. le dépassement de l’enveloppe réduit le disponible', () => {
  const state = addSpending(buyGroceries(), {
    id: 'courses-depassement', category: 'groceries', date: today, amount: 300, balanceIncluded: false,
  }, today);
  assert.equal(state.currentBalance, 650);
  assert.equal(Math.max(0, 40000 - spentInMonth(spendingsOf(state), 'groceries', '2026-12')), 0);
  assert.equal(summary(state).trueAvailable, 200);
});

test('P3-1 — 4. une dépense dans une catégorie sans enveloppe réduit le disponible', () => {
  const state = addSpending(base, {
    id: 'restaurant', category: 'restaurants', date: today, amount: 30, balanceIncluded: false,
  }, today);
  assert.equal(summary(state).trueAvailable, 270);
});

test('P3-1 — 5. réduire l’enveloppe de 100 € libère 100 € sur chaque mois projeté', () => {
  const state = upsertEnvelope(base, { ...groceries, monthlyAmount: 300 });
  assert.equal(summary(state).trueAvailable, 500);
});

test('P3-1 — 6. une dépense déjà comprise réduit dynamiquement la part non encodée', () => {
  const state = refreshBalance();
  assert.deepEqual(balanceGapsOf(state), [
    { id: 'gap-2026-12-10', fromDate: '2026-12-01', date: '2026-12-10', amount: 50 },
  ]);
  assert.equal(balanceRevisionOf(state), 1);
  assert.equal(analyzeMonth(state, '2026-12').unrecordedCents, 5000);

  const updated = addSpending(state, {
    id: 'courses-8', category: 'groceries', date: '2026-12-08', amount: 20, balanceIncluded: true,
  }, today);
  assert.equal(updated.currentBalance, 900);
  assert.equal(analyzeMonth(updated, '2026-12').unrecordedCents, 3000);
});

test('P3-1 — 7. deux corrections le même jour conservent un seul écart', () => {
  const state = updateBalance(refreshBalance(), { amount: 880, today });
  assert.deepEqual(balanceGapsOf(state), [
    { id: 'gap-2026-12-10', fromDate: '2026-12-01', date: '2026-12-10', amount: 70 },
  ]);
});

test('P3-1 — 8. supprimer une dépense recrédite seulement la révision du solde en cours', () => {
  const refreshed = refreshBalance();
  assert.equal(deleteSpending(refreshed, 'courses-10').currentBalance, 900);
  const later = addSpending(refreshed, {
    id: 'apres-solde', category: 'groceries', date: today, amount: 50, balanceIncluded: false,
  }, today);
  assert.equal(later.currentBalance, 850);
  assert.equal(deleteSpending(later, 'apres-solde').currentBalance, 900);
});

test('P3-1 — 9. seules les échéances cochées et réglées expliquent l’écart de solde', () => {
  const date = '2026-12-03';
  const budget = {
    ...emptyBudgetState,
    currentBalance: 1000,
    balanceDate: '2026-11-25',
    userProfile: { ...emptyBudgetState.userProfile, safetyReserve: 50 },
    incomes: [{
      id: 'salaire', label: 'Salaire', type: 'salary', amount: 1430, frequency: 'monthly',
      isConfirmed: true, expectedDate: '2026-12-28',
    }],
    expenses: [
      { id: 'loyer', label: 'Loyer', category: 'rent', amount: 650, frequency: 'monthly', dueDate: '2026-12-01', isPaid: false, isRecurring: true },
      { id: 'gsm', label: 'GSM', category: 'phone', amount: 25, frequency: 'monthly', dueDate: '2026-12-15', isPaid: false, isRecurring: true },
      { id: 'eau', label: 'Eau', category: 'energy', amount: 30, frequency: 'one_time', dueDate: '2026-11-20', isPaid: false, isRecurring: false },
    ],
    debts: [{
      id: 'ing', creditor: 'ING', type: 'personal', initialAmount: 1200, remainingAmount: 890,
      monthlyPayment: 50, status: 'to_pay', nextDueDate: '2026-12-02', isMediationIncluded: false,
    }],
  };
  const rent = { type: 'expense', id: 'loyer', dueDate: '2026-12-01' };
  const loan = { type: 'debt', id: 'ing', dueDate: '2026-12-02' };
  const afterUpdate = (settled) => updateBalance(budget, { amount: 300, today: date, settled });
  const both = afterUpdate([rent, loan]);
  const neither = afterUpdate([]);
  const rentOnly = afterUpdate([rent]);
  assert.deepEqual(balanceGapsOf(both), []);
  assert.deepEqual(balanceGapsOf(neither), [
    { id: 'gap-2026-12-03', fromDate: '2026-11-25', date: '2026-12-03', amount: 700 },
  ]);
  assert.deepEqual(balanceGapsOf(rentOnly), [
    { id: 'gap-2026-12-03', fromDate: '2026-11-25', date: '2026-12-03', amount: 50 },
  ]);
  for (const state of [both, neither, rentOnly]) {
    assert.equal(summary(state, date).trueAvailable, summary({ ...state, balanceGaps: [] }, date).trueAvailable);
  }
});

test('P3-1 — 10. l’analyse réunit les charges payées et les dépenses du mois', () => {
  const state = {
    ...emptyBudgetState,
    expenses: [{
      id: 'loyer', label: 'Loyer', category: 'rent', amount: 650, frequency: 'monthly', dueDate: '2026-12-01',
      isPaid: false, isRecurring: true, occurrenceStatuses: { '2026-12-01': 'paid' },
    }],
    spendings: [
      { id: 'courses', category: 'groceries', date: today, amount: 42.28, balanceIncluded: false, debited: true, balanceRevision: 0 },
    ],
  };
  const analysis = analyzeMonth(state, '2026-12');
  assert.deepEqual(analysis.rows.map(({ category, cents }) => [category, cents]), [
    ['rent', 65000],
    ['groceries', 4228],
  ]);
  assert.equal(analysis.totalCents, 69228);
});

test('P3-1 — 11. la comparaison utilise seulement les mois précédents renseignés', () => {
  const state = {
    ...emptyBudgetState,
    spendings: [
      { id: 'novembre', category: 'groceries', date: '2026-11-20', amount: 300, balanceIncluded: false, debited: true, balanceRevision: 0 },
      { id: 'decembre', category: 'groceries', date: today, amount: 200, balanceIncluded: false, debited: true, balanceRevision: 0 },
    ],
  };
  const [december] = analyzeMonth(state, '2026-12').rows;
  assert.equal(december.previousCents, 30000);
  assert.equal(december.averageCents, 30000);
  const [november] = analyzeMonth(state, '2026-11').rows;
  assert.equal(november.previousCents, 0);
  assert.equal(november.averageCents, null);
});

test('P3-1 — 12. remplacer une charge par une enveloppe applique la nouvelle projection', () => {
  const budget = {
    ...emptyBudgetState,
    currentBalance: 1000,
    userProfile: { ...emptyBudgetState.userProfile, safetyReserve: 50 },
    expenses: [{
      id: 'courses', label: 'Courses', category: 'groceries', amount: 300, frequency: 'monthly',
      dueDate: '2026-12-20', isPaid: false, isRecurring: true,
    }],
  };
  assert.equal(summary(budget).trueAvailable, 650);

  const replaced = replaceExpenseWithEnvelope(budget, 'courses', 'groceries');
  assert.deepEqual(replaced.expenses, []);
  assert.deepEqual(envelopesOf(replaced).map(({ category, label, monthlyAmount }) => ({ category, label, monthlyAmount })), [
    { category: 'groceries', label: 'Courses', monthlyAmount: 300 },
  ]);
  assert.equal(summary(replaced).trueAvailable, 350);
  assert.equal(summary({ ...budget, envelopes: envelopesOf(replaced) }).trueAvailable, 50);
});

test('P3-1 — 13. la sauvegarde v2 préserve les nouvelles données et l’absence des nouveaux champs', () => {
  const state = {
    ...base,
    balanceGaps: [
      { id: 'gap-2026-12-10', fromDate: '2026-12-01', date: '2026-12-10', amount: -12.34 },
    ],
    merchantCategories: { colruyt: 'groceries' },
  };
  const serialized = serializeBudget(state);
  assert.equal(JSON.parse(serialized).version, 2);
  const restored = deserializeBudget(serialized);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), state);
  assert.equal(serializeBudget(restored), serialized);

  const previous = { ...emptyBudgetState, currentBalance: 1000 };
  const previousContents = serializeBudget(previous);
  const restoredPrevious = deserializeBudget(previousContents);
  const migratedPrevious = migrateLegacyBudget(JSON.stringify(previous), emptyBudgetState, today);
  for (const budget of [restoredPrevious, migratedPrevious]) {
    assert.deepEqual(Object.keys(budget), Object.keys(previous));
    assert.deepEqual(envelopesOf(budget), []);
    assert.deepEqual(spendingsOf(budget), []);
    assert.deepEqual(balanceGapsOf(budget), []);
    assert.deepEqual(merchantCategoriesOf(budget), {});
    assert.equal(balanceRevisionOf(budget), 0);
  }
  assert.equal(serializeBudget(restoredPrevious), previousContents);

  const duplicate = JSON.parse(serialized);
  duplicate.state.envelopes.push({ ...duplicate.state.envelopes[0], id: 'autres-courses' });
  assert.throws(() => deserializeBudget(JSON.stringify(duplicate)), /Catégories en double dans « budget\.envelopes »\./);
  const zeroSpending = JSON.parse(serialized);
  zeroSpending.state.spendings[0].amount = 0;
  assert.throws(() => deserializeBudget(JSON.stringify(zeroSpending)), /budget\.spendings\[0\]\.amount/);
});

test('P3-1 — 14. la saisie rapide reconnaît les montants du plan', () => {
  const cases = [
    ['42,28 Colruyt', 42.28, 'Colruyt'],
    ["j'ai dépensé 12 euros au primeur", 12, 'primeur'],
    ['42 euros 28 Delhaize', 42.28],
    ['€7,5 pharmacie', 7.5],
    ['Colruyt', undefined],
    ['0', undefined],
  ];
  for (const [text, amount, label] of cases) {
    const entry = parseQuickEntry(text);
    assert.equal(entry.amount, amount, text);
    if (label !== undefined) assert.equal(entry.label, label, text);
  }
});

test('P3-1 — 15. le dictionnaire et la mémoire proposent les catégories prévues', () => {
  assert.equal(merchantKey('COLRUYT MARBAIS MAR'), 'colruyt');
  assert.equal(merchantKey('CRF EXP SCHAERBEEK'), 'crf');
  assert.equal(merchantKey('Q8 Wavre'), 'q8');
  assert.equal(merchantKey('H&M Namur'), 'h m');
  assert.equal(suggestCategory('CRF EXP SCHAERBEEK', {}), 'groceries');
  assert.equal(suggestCategory('Q8 Wavre', {}), 'transport');
  assert.equal(suggestCategory('Louis Delhaize Tubize', {}), 'groceries');
  assert.equal(suggestCategory('Cadi Marbais', { cadi: 'home' }), 'home');
  assert.equal(suggestCategory('Boulangerie Dupont', {}), undefined);
});

test('P3-1 — le simulateur utilise le disponible après les réservations des enveloppes', () => {
  const result = simulatePurchase(summary(base).availableForecast, 300, today);
  assert.deepEqual(result, { affordable: true, lowestDate: '2027-01-01', lowestBalance: 50, available: 0 });
});
