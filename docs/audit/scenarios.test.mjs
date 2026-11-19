// Les attendus viennent du rapport D.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { generateAdvice } from '../../lib/advice-engine.ts';
import {
  calculateBudgetSummary,
  calculateGoalFeasibility,
  calculateTotalMonthlyExpenses,
  getUpcomingReminders,
  toMonthlyAmount,
} from '../../lib/budget-calculations.ts';
import {
  cancelExpenseOccurrence,
  deserializeBudget,
  migrateLegacyBudget,
  recordPayment,
  serializeBudget,
} from '../../lib/budget-state.ts';
import {
  mockChildExpenses,
  mockCurrentBalance,
  mockDebts,
  mockExpenses,
  mockIncomes,
  mockMediationFile,
  mockUser,
} from '../../lib/mock-data.ts';
import { buildProjection } from '../../lib/projection.ts';

process.env.TZ = 'Europe/Brussels';

beforeEach(({ mock }) => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-05-29T10:00:00+02:00') });
});

function income(amount, overrides = {}) {
  return {
    id: 'income',
    label: 'Revenu',
    type: 'salary',
    amount,
    frequency: 'monthly',
    isConfirmed: true,
    ...overrides,
  };
}

function expense(amount, overrides = {}) {
  return {
    id: 'expense',
    label: 'Charge',
    category: 'other',
    amount,
    frequency: 'monthly',
    isPaid: false,
    isRecurring: true,
    ...overrides,
  };
}

function debt(id, remainingAmount, monthlyPayment, nextDueDate, status = 'to_pay') {
  return {
    id,
    creditor: id,
    type: 'personal',
    initialAmount: 1000,
    remainingAmount,
    monthlyPayment,
    nextDueDate,
    status,
    isMediationIncluded: false,
  };
}

test('S0 — un budget vide ne déclenche pas d’alerte', () => {
  const empty = calculateBudgetSummary(0, [], [], [], [], 50);
  const atReserve = calculateBudgetSummary(50, [], [], [], [], 50);

  assert.deepEqual(
    {
      emptyRisk: empty.riskLevel,
      availableAtReserve: atReserve.trueAvailable,
      // Le rapport prévoit de supprimer le score. S’il existe, il doit être fini.
      finiteScore: atReserve.riskScore === undefined || Number.isFinite(atReserve.riskScore),
    },
    { emptyRisk: 'safe', availableAtReserve: 0, finiteScore: true },
  );
});

test('S1 — un salaire déjà reçu et un loyer déjà payé sont dans le solde', ({ mock }) => {
  mock.timers.setTime(Date.parse('2026-06-10T10:00:00+02:00'));
  const incomes = [income(2000, { expectedDate: '2026-06-05' })];
  const expenses = [
    expense(800, { id: 'loyer', frequency: 'one_time', dueDate: '2026-06-01', isPaid: true }),
    expense(400, { id: 'courses', dueDate: '2026-06-15' }),
  ];

  const summary = calculateBudgetSummary(2100, incomes, expenses, [], [], 50);

  assert.equal(summary.trueAvailable, 1650);
});

test('S2 — payer le loyer et mettre à jour le solde ne change pas le disponible', () => {
  const incomes = [income(1500)];
  const rent = expense(650, { dueDate: '2026-05-29' });
  const before = calculateBudgetSummary(1000, incomes, [rent], [], [], 50);
  const after = calculateBudgetSummary(350, incomes, [{ ...rent, isPaid: true }], [], [], 50);

  assert.equal(after.trueAvailable, before.trueAvailable);
});

test('S3 — une pension incertaine est exclue du disponible prudent', () => {
  const incomes = [
    income(1150, { expectedDate: '2026-05-29' }),
    income(200, { id: 'pension', type: 'alimony', isConfirmed: false, expectedDate: '2026-05-29' }),
  ];
  const expenses = [expense(1100, { dueDate: '2026-05-29' })];
  const summary = calculateBudgetSummary(100, incomes, expenses, [], [], 50);

  assert.equal(summary.trueAvailable, 100);
  assert.equal(summary.availableForecast.optimisticAvailable, 300);
});

test('S4 — une facture ponctuelle datée est prise en compte', () => {
  const expenses = [expense(500, {
    label: 'Réparation voiture',
    frequency: 'one_time',
    isRecurring: false,
    dueDate: '2026-06-05',
  })];
  const summary = calculateBudgetSummary(600, [], expenses, [], [], 50);
  const projection = buildProjection(600, [], expenses, [], [], 50);
  const reminders = getUpcomingReminders(expenses, [], []);

  assert.deepEqual(
    {
      available: summary.trueAvailable,
      events: projection.events.map(({ date, amount }) => [date, amount]),
      balanceAtDay30: projection.milestones.find(({ daysFromNow }) => daysFromNow === 30)?.balance,
      reminders: reminders.map(({ label }) => label),
    },
    {
      available: 50,
      events: [['2026-06-05', -500]],
      balanceAtDay30: 100,
      reminders: ['Réparation voiture'],
    },
  );
});

test('S5 — des frais enfants historiques et remboursés ne pèsent plus sur le disponible', () => {
  const history = Array.from({ length: 12 }, (_, month) => ({
    id: `child-${month + 1}`,
    label: 'Frais enfant',
    category: 'other',
    totalAmount: 100,
    paidByUser: 100,
    shareAmount: 50,
    status: 'reimbursed',
    date: `2025-${String(month + 1).padStart(2, '0')}-10`,
    receiptSent: true,
  }));
  const incomes = [income(1500, { expectedDate: '2026-05-29' })];
  const expenses = [expense(1000, { dueDate: '2026-05-29' })];
  const summary = calculateBudgetSummary(1000, incomes, expenses, [], history, 50);

  assert.equal(summary.trueAvailable, 1450);
});

test('S6 — la capacité d’épargne est fondée sur la marge mensuelle certaine', () => {
  const summary = calculateBudgetSummary(
    mockCurrentBalance, mockIncomes, mockExpenses, mockDebts, mockChildExpenses, 50,
  );
  const confirmedIncomes = mockIncomes.map((item) => ({ ...item, isConfirmed: true }));
  const withPension = calculateBudgetSummary(
    mockCurrentBalance, confirmedIncomes, mockExpenses, mockDebts, mockChildExpenses, 50,
  );
  const advice = generateAdvice(summary, mockDebts, mockMediationFile);

  assert.deepEqual(
    {
      prudentCapacity: summary.savingsCapacity,
      capacityWithConfirmedPension: withPension.savingsCapacity,
      recommendsSaving: advice.some(({ id }) => id === 'adv-savings'),
    },
    // La marge certaine est de −77 €. Elle ne laisse aucune capacité d’épargne.
    { prudentCapacity: 0, capacityWithConfirmedPension: 123, recommendsSaving: false },
  );
});

test('S7 — les conseils tiennent compte des revenus et de la réserve de l’utilisateur', () => {
  const incomes = [income(3000)];
  const expenses = [expense(1000)];
  const highBalance = calculateBudgetSummary(5000, incomes, expenses, [], [], 500);
  const lowerBalance = calculateBudgetSummary(1000, incomes, expenses, [], [], 500);
  const advice = generateAdvice(highBalance, [], null);
  const reserveAdvice = generateAdvice(lowerBalance, [], null).filter(({ id }) => id === 'adv-reserve');

  assert.deepEqual(
    {
      mentionsUncertainIncome: advice.some(({ id }) => id === 'adv-income-confirm'),
      reserveMatchesSettings: reserveAdvice.every(({ message }) => /\b500\s*€/.test(message)),
    },
    { mentionsUncertainIncome: false, reserveMatchesSettings: true },
  );
});

test('S8 — la projection applique les charges de J0, J7 et J30 à leur date locale', () => {
  const expenses = [
    expense(100, { id: 'j0', dueDate: '2026-05-29' }),
    expense(200, { id: 'j7', dueDate: '2026-06-05' }),
    expense(300, { id: 'j30', dueDate: '2026-06-28' }),
  ];
  const projection = buildProjection(1000, [], expenses, [], [], 50);

  assert.deepEqual(
    projection.milestones
      .filter(({ daysFromNow }) => [0, 7, 15, 30].includes(daysFromNow))
      .map(({ daysFromNow, date, balance }) => [daysFromNow, date, balance]),
    [
      [0, '2026-05-29', 900],
      [7, '2026-06-05', 700],
      [15, '2026-06-13', 700],
      [30, '2026-06-28', 400],
    ],
  );
});

test('S9 — les récurrences hebdomadaires donnent quatre revenus et quatre charges à J30', () => {
  const incomes = [income(300, { frequency: 'weekly', expectedDate: '2026-06-01' })];
  const expenses = [expense(100, { frequency: 'weekly', dueDate: '2026-06-04' })];
  const projection = buildProjection(0, incomes, expenses, [], [], 50);

  assert.deepEqual(
    {
      events: projection.events
        .filter(({ date }) => date >= '2026-05-29' && date <= '2026-06-28')
        .map(({ date, amount }) => [date, amount]),
      balanceAtDay30: projection.milestones.find(({ daysFromNow }) => daysFromNow === 30)?.balance,
    },
    {
      events: [
        ['2026-06-01', 300], ['2026-06-04', -100],
        ['2026-06-08', 300], ['2026-06-11', -100],
        ['2026-06-15', 300], ['2026-06-18', -100],
        ['2026-06-22', 300], ['2026-06-25', -100],
      ],
      balanceAtDay30: 800,
    },
  );
});

test('S10 — les échéances de la démo se renouvellent et les impayés restent signalés', ({ mock }) => {
  mock.timers.setTime(Date.parse('2026-11-17T10:00:00+01:00'));
  const expenses = [
    ...mockExpenses.map((item) => item.id === 'exp-5' ? { ...item, dueDate: '2026-06-15' } : item),
    expense(100, {
      id: 'retard',
      label: 'Facture impayée',
      frequency: 'one_time',
      isRecurring: false,
      dueDate: '2026-11-16',
    }),
  ];
  const projection = buildProjection(
    mockCurrentBalance, mockIncomes, expenses, mockDebts, mockChildExpenses, 50,
  );
  const reminders = getUpcomingReminders(expenses, mockDebts, mockMediationFile.steps);
  const nextEvents = projection.events.filter(({ date }) => date > '2026-11-17' && date <= '2026-12-17');

  assert.deepEqual(
    {
      eventCount: nextEvents.length,
      projectedRent: nextEvents.some(
        ({ date, label, amount }) => date === '2026-12-01' && label === 'Loyer' && amount === -650,
      ),
      overdueReminder: reminders.some(({ label }) => label === 'Facture impayée'),
    },
    // 3 revenus, 8 charges et 3 remboursements récurrents dans les 30 prochains jours.
    { eventCount: 14, projectedRent: true, overdueReminder: true },
  );
});

test('S11 — les rappels incluent les échéances du jour et les retards', () => {
  const expenses = [
    expense(100, { id: 'jour', label: 'Due aujourd’hui', frequency: 'one_time', dueDate: '2026-05-29' }),
    expense(100, { id: 'payee', label: 'Payée', frequency: 'one_time', dueDate: '2026-06-02', isPaid: true }),
    expense(100, { id: 'retard', label: 'En retard', frequency: 'one_time', dueDate: '2026-05-20' }),
  ];

  assert.deepEqual(
    getUpcomingReminders(expenses, [], []).map(({ label }) => label).sort(),
    ['Due aujourd’hui', 'En retard'],
  );
});

test('S12 — un arriéré sans mensualité reste dû et la dernière mensualité est plafonnée', () => {
  const debts = [
    debt('Arriéré', 900, 0, '2026-05-10', 'late'),
    debt('Dernière mensualité', 40, 100, '2026-06-10'),
  ];
  const summary = calculateBudgetSummary(500, [], [], debts, [], 50);
  const projection = buildProjection(500, [], [], debts, [], 50);

  assert.deepEqual(
    {
      monthlyPayments: summary.totalMonthlyDebts,
      paymentsDue: projection.events.map(({ amount }) => amount).sort((a, b) => a - b),
    },
    { monthlyPayments: 40, paymentsDue: [-900, -40] },
  );
});

test('S13 — les centimes sont exacts et un disponible nul reste neutre', () => {
  const expenses = [
    expense(0.10, { id: 'dix', dueDate: '2026-05-29', endDate: '2026-05-29' }),
    expense(0.20, { id: 'vingt', dueDate: '2026-05-29', endDate: '2026-05-29' }),
  ];
  const summary = calculateBudgetSummary(0.30, [], expenses, [], [], 0);

  assert.deepEqual(
    {
      expenses: calculateTotalMonthlyExpenses(expenses),
      available: summary.trueAvailable,
      risk: summary.riskLevel,
      weeklyEquivalentInCents: Math.round(toMonthlyAmount(100, 'weekly') * 100),
    },
    { expenses: 0.30, available: 0, risk: 'safe', weeklyEquivalentInCents: 43333 },
  );
});

test('S14 — un objectif à 400 €/mois dépasse la marge de 200 €/mois', () => {
  const goal = {
    id: 'goal',
    label: 'Objectif',
    targetAmount: 1000,
    savedAmount: 0,
    monthlyContribution: 400,
    status: 'realistic',
  };
  // Le résumé doit intégrer les provisions pour les objectifs qui lui sont fournis.
  const summary = calculateBudgetSummary(0, [income(1500)], [expense(1300)], [], [], 50, [goal]);

  assert.deepEqual(
    {
      remainingSavings: summary.savingsCapacity,
      goalStatus: calculateGoalFeasibility(goal, 200),
    },
    { remainingSavings: 0, goalStatus: 'fragile' },
  );
});

test('S15 — la démo du 29 mai laisse 98,50 € disponibles après réserve', () => {
  const summary = calculateBudgetSummary(
    mockCurrentBalance, mockIncomes, mockExpenses, mockDebts, mockChildExpenses, 50,
  );
  const projection = buildProjection(
    mockCurrentBalance,
    mockIncomes.filter(({ isConfirmed }) => isConfirmed),
    mockExpenses,
    mockDebts,
    mockChildExpenses,
    50,
  );

  assert.deepEqual(
    {
      available: summary.trueAvailable,
      lowestBalance: projection.lowestBalance,
      lowestDate: projection.lowestDate,
      causes: summary.availableForecast.causes,
    },
    {
      available: 98.50,
      lowestBalance: 148.50,
      lowestDate: '2026-06-01',
      causes: ['Loyer', 'Transport (STIB)'],
    },
  );
});

const emptyState = {
  currentBalance: 0,
  userProfile: mockUser,
  incomes: [],
  expenses: [],
  debts: [],
  childExpenses: [],
  goals: [],
  mediationFile: mockMediationFile,
  documents: [],
};

test('Une charge ancrée au 31 mai revient en juin, juillet et août sans dériver', () => {
  const rent = expense(50, {
    dueDate: '2026-05-31',
    endDate: '2026-08-31',
    trackedFrom: '2026-05-31',
    occurrenceStatuses: { '2026-05-31': 'paid' },
  });
  const projection = buildProjection(250, [], [rent], [], [], 50, { today: '2026-06-01', horizon: 120 });

  assert.deepEqual(projection.events.map(({ dueDate }) => dueDate), ['2026-06-30', '2026-07-31', '2026-08-31']);
});

test('La migration v1 conserve les données et enregistre les montants v2 en centimes', () => {
  const legacy = JSON.stringify({
    ...emptyState,
    currentBalance: 847.50,
    expenses: [
      expense(59.90, { id: 'paid', dueDate: '2026-05-29', isPaid: true }),
      expense(10.05, { id: 'late', dueDate: '2026-05-28' }),
    ],
  });
  const migrated = migrateLegacyBudget(legacy, emptyState, '2026-05-29');
  const stored = serializeBudget(migrated);
  const raw = JSON.parse(stored);
  const reloaded = deserializeBudget(stored);

  assert.equal(raw.version, 2);
  assert.equal(raw.state.currentBalance, 84750);
  assert.deepEqual(raw.state.expenses.map(({ amount }) => amount), [5990, 1005]);
  assert.deepEqual(reloaded.expenses[0].occurrenceStatuses, { '2026-05-29': 'paid' });
  assert.equal(reloaded.expenses[1].trackedFrom, '2026-05-28');
  assert.equal(reloaded.currentBalance, JSON.parse(legacy).currentBalance);
  assert.equal(serializeBudget(reloaded), stored);
});

test('Un paiement de charge débite le solde une fois et garde l’échéance suivante', () => {
  const state = {
    ...emptyState,
    currentBalance: 90.25,
    expenses: [expense(30.15, { dueDate: '2026-05-29', trackedFrom: '2026-05-29' })],
  };
  const payment = {
    type: 'expense', id: 'expense', today: '2026-05-29', dueDate: '2026-05-29', balanceIncludesPayment: false,
  };
  const paid = recordPayment(state, payment);
  const projection = buildProjection(paid.currentBalance, [], paid.expenses, [], [], 50, { horizon: 35 });

  assert.equal(paid.currentBalance, 60.10);
  assert.equal(paid.balanceDate, '2026-05-29');
  assert.equal(recordPayment(paid, payment), paid);
  assert.deepEqual(projection.events.map(({ dueDate }) => dueDate), ['2026-06-29']);

  const cancelled = cancelExpenseOccurrence(paid, 'expense', '2026-06-29', '2026-05-29');
  assert.equal(cancelled.currentBalance, paid.currentBalance);
  assert.equal(cancelled.expenses[0].occurrenceStatuses['2026-06-29'], 'cancelled');
});

test('Un versement déjà déduit solde la dette sans débiter de nouveau le compte', () => {
  const state = {
    ...emptyState,
    currentBalance: 500,
    debts: [debt('dette', 40.15, 100, '2026-05-29')],
  };
  const paid = recordPayment(state, {
    type: 'debt', id: 'dette', today: '2026-05-29', dueDate: '2026-05-29', balanceIncludesPayment: true,
  });

  assert.equal(paid.currentBalance, 500);
  assert.equal(paid.debts[0].remainingAmount, 0);
  assert.equal(paid.debts[0].status, 'completed');
});

test('Un revenu reçu et déjà inclus dans le solde ne compte plus dans la projection', () => {
  const state = {
    ...emptyState,
    currentBalance: 700,
    incomes: [income(600, { expectedDate: '2026-05-29' })],
  };
  const received = recordPayment(state, {
    type: 'income', id: 'income', today: '2026-05-29', dueDate: '2026-05-29', balanceIncludesPayment: true,
  });
  const projection = buildProjection(received.currentBalance, received.incomes, [], [], [], 50, { horizon: 35 });

  assert.equal(received.currentBalance, 700);
  assert.deepEqual(projection.events.map(({ dueDate }) => dueDate), ['2026-06-29']);
});

test('Le disponible inclut le jour 35 de la projection', () => {
  const expenses = [expense(200, { frequency: 'one_time', dueDate: '2026-07-03' })];
  const summary = calculateBudgetSummary(250, [], expenses, [], [], 50);

  assert.equal(summary.trueAvailable, 0);
  assert.equal(summary.availableForecast.date, '2026-07-03');
});
