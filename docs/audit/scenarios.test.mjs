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
  BUDGET_STORAGE_KEY,
  LEGACY_BUDGET_STORAGE_KEY,
  cancelExpenseOccurrence,
  deserializeBudget,
  deserializeStoredBudget,
  emptyBudgetState,
  migrateLegacyBudget,
  readBudgetSnapshot,
  recordPayment,
  recordUnscheduledDebtPayment,
  serializeBudget,
  writeBudgetSnapshot,
} from '../../lib/budget-state.ts';
import {
  mockChildExpenses,
  mockCurrentBalance,
  mockDebts,
  mockDocuments,
  mockExpenses,
  mockGoals,
  mockIncomes,
  mockMediationFile,
  mockUser,
} from '../../lib/mock-data.ts';
import { buildProjection } from '../../lib/projection.ts';
import { estimateDebtEndDate, nextDebtOccurrence } from '../../lib/debt-payoff.ts';
import { createFirstBudget } from '../../lib/onboarding.ts';
import { parseAmountInput } from '../../lib/money.ts';
import { selectUpcomingPaymentReminders } from '../../lib/payment-reminders.ts';
import { simulatePurchase } from '../../lib/purchase-simulation.ts';

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
  const advice = generateAdvice(summary, mockIncomes, mockDebts);

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
  const incomes = [income(3000, { expectedDate: '2026-06-05' })];
  const expenses = [expense(1000, { dueDate: '2026-06-01' })];
  const highBalance = calculateBudgetSummary(5000, incomes, expenses, [], [], 500);
  const lowerBalance = calculateBudgetSummary(1000, incomes, expenses, [], [], 500);
  const advice = generateAdvice(highBalance, incomes, []);
  const reserveAdvice = generateAdvice(lowerBalance, incomes, []).find(({ id }) => id === 'adv-reserve');
  assert.equal(advice.some(({ id }) => id === 'adv-income-confirm' || id === 'adv-reserve'), false);
  assert.match(reserveAdvice?.message ?? '', /\b500,00\s*€/);

  const uncertainIncome = income(200, {
    id: 'variable', isConfirmed: false, expectedDate: '2026-06-03', frequency: 'one_time',
  });
  const withUncertain = [...incomes, uncertainIncome];
  const expected = calculateBudgetSummary(1000, withUncertain, expenses, [], [], 500);
  assert.equal(generateAdvice(expected, withUncertain, []).some(({ id }) => id === 'adv-income-confirm'), true);
  const received = [...incomes, { ...uncertainIncome, occurrenceStatuses: { '2026-06-03': 'paid' } }];
  assert.equal(generateAdvice(expected, received, []).some(({ id }) => id === 'adv-income-confirm'), false);

  const deficit = calculateBudgetSummary(100, incomes, expenses, [], [], 500);
  const deficitAdvice = generateAdvice(deficit, incomes, []);
  assert.equal(deficitAdvice.some(({ id }) => id === 'adv-danger'), true);
  assert.doesNotMatch(deficitAdvice.map(({ message }) => message).join(' '), /médiateur|pension/i);
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

test('P2-4 — seuls les paiements ouverts du lendemain déclenchent un rappel', () => {
  const expenses = [
    expense(100, { id: 'retard', isRecurring: false, dueDate: '2026-05-28' }),
    expense(100, { id: 'jour', isRecurring: false, dueDate: '2026-05-29' }),
    expense(100, { id: 'demain', dueDate: '2026-04-30' }),
    expense(100, { id: 'payee', dueDate: '2026-05-30', isPaid: true }),
    expense(100, { id: 'annulee', dueDate: '2026-05-30', occurrenceStatuses: { '2026-05-30': 'cancelled' } }),
    expense(100, { id: 'apres', isRecurring: false, dueDate: '2026-05-31' }),
  ];
  const debts = [
    debt('mensualite', 90, 50, '2026-05-30'),
    debt('suspendue', 90, 50, '2026-05-30', 'suspended'),
  ];
  const reminders = getUpcomingReminders(expenses, debts, [], '2026-05-29');

  assert.deepEqual(
    selectUpcomingPaymentReminders(reminders, '2026-05-29', true)
      .filter(({ remindTomorrow }) => remindTomorrow)
      .map(({ reminder }) => reminder.refId),
    ['demain', 'mensualite'],
  );
});

test('P2-4 — le rappel couvre aussi la quatrième échéance, sauf si le réglage est désactivé', () => {
  const expenses = ['eau', 'loyer', 'internet', 'électricité'].map((id) =>
    expense(20, { id, isRecurring: false, dueDate: '2026-06-01' }),
  );
  const reminders = getUpcomingReminders(expenses, [], [], '2026-05-31');
  const enabled = selectUpcomingPaymentReminders(reminders, '2026-05-31', true);
  const disabled = selectUpcomingPaymentReminders(reminders, '2026-05-31', false);

  assert.deepEqual(enabled.map(({ reminder }) => reminder.refId), expenses.map(({ id }) => id));
  assert.ok(enabled.every(({ remindTomorrow }) => remindTomorrow));
  assert.deepEqual(disabled.map(({ reminder }) => reminder.refId), expenses.slice(0, 3).map(({ id }) => id));
  assert.ok(disabled.every(({ remindTomorrow }) => !remindTomorrow));
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

test('Le premier budget reste vide, y compris après enregistrement', () => {
  const blank = deserializeBudget(serializeBudget(emptyBudgetState));
  const summary = calculateBudgetSummary(
    blank.currentBalance, blank.incomes, blank.expenses, blank.debts, blank.childExpenses, blank.userProfile.safetyReserve,
  );

  assert.equal(blank.userProfile.firstName, '');
  assert.equal(summary.emptyBudget, true);
  assert.deepEqual(blank.goals, []);
  assert.deepEqual(blank.documents, []);
  assert.deepEqual(blank.mediationFile.steps, []);
  assert.deepEqual(generateAdvice(summary, blank.incomes, blank.debts), []);
});

test('Les montants saisis au démarrage acceptent la virgule, les centimes et les découverts', () => {
  assert.equal(parseAmountInput(' 1\u202f234,56 '), 1234.56);
  assert.equal(parseAmountInput('-12,50'), -12.5);
  assert.equal(parseAmountInput('12.50'), 12.5);
  for (const invalid of ['', '1,234', '1 2,00', '1e3', '10 euros']) {
    assert.equal(Number.isNaN(parseAmountInput(invalid)), true);
  }
});

test('Le premier budget conserve les dates et calcule le vrai disponible avant le prochain versement', () => {
  const today = '2026-11-19';
  const budget = createFirstBudget(emptyBudgetState, {
    balance: 800,
    income: { amount: 1000, date: '2026-11-25' },
    bills: [
      { label: 'Loyer', amount: 300, date: '2026-11-20' },
      { label: 'Électricité', amount: 50, date: '2026-11-21' },
    ],
  }, today);
  const restored = deserializeBudget(serializeBudget(budget));
  const summary = calculateBudgetSummary(
    restored.currentBalance, restored.incomes, restored.expenses, restored.debts, restored.childExpenses,
    restored.userProfile.safetyReserve, restored.goals, today,
  );

  assert.equal(restored.balanceDate, today);
  assert.equal(restored.incomes[0].isConfirmed, true);
  assert.equal(restored.incomes[0].frequency, 'one_time');
  assert.deepEqual(restored.expenses.map(({ frequency, dueDate }) => [frequency, dueDate]), [
    ['one_time', '2026-11-20'], ['one_time', '2026-11-21'],
  ]);
  assert.equal(summary.availableForecast.date, '2026-11-21');
  assert.equal(summary.trueAvailable, 400);
  assert.deepEqual(emptyBudgetState.incomes, []);
  assert.deepEqual(emptyBudgetState.expenses, []);
});

test('La courbe du solde et le vrai disponible partagent la projection prudente sur 35 jours', () => {
  const today = '2026-11-19';
  const budget = createFirstBudget(emptyBudgetState, {
    balance: 800,
    income: { amount: 1000, date: '2026-11-25' },
    bills: [{ label: 'Loyer', amount: 350, date: '2026-11-21' }],
  }, today);
  const incomes = [...budget.incomes, income(200, {
    id: 'incertain',
    frequency: 'one_time',
    expectedDate: '2026-11-20',
    isConfirmed: false,
  })];
  const summary = calculateBudgetSummary(
    budget.currentBalance, incomes, budget.expenses, [], [], budget.userProfile.safetyReserve, [], today,
  );
  const { dailyBalances, date, balance, optimisticAvailable } = summary.availableForecast;

  assert.equal(dailyBalances.length, 36);
  assert.deepEqual(dailyBalances[0], { date: today, balance: 800 });
  assert.deepEqual(dailyBalances[1], { date: '2026-11-20', balance: 800 });
  assert.deepEqual(dailyBalances[2], { date, balance });
  assert.deepEqual(dailyBalances.at(-1), { date: '2026-12-24', balance: 1450 });
  assert.equal(summary.trueAvailable, 400);
  assert.equal(optimisticAvailable, 600);
});

test('Les prochaines échéances peuvent reprendre l’horizon du vrai disponible', () => {
  const expenseAtEnd = expense(20, { frequency: 'one_time', dueDate: '2026-12-24' });
  const today = '2026-11-19';
  assert.deepEqual(getUpcomingReminders([expenseAtEnd], [], [], today), []);
  assert.equal(getUpcomingReminders([expenseAtEnd], [], [], today, 35)[0].dueDate, '2026-12-24');
});

test('Le démarrage accepte un solde nul sans échéances et refuse une saisie incomplète', () => {
  const today = '2026-11-19';
  const input = { balance: 0, bills: [] };
  const budget = createFirstBudget(emptyBudgetState, input, today);
  assert.equal(budget.currentBalance, 0);
  assert.equal(budget.balanceDate, today);
  assert.deepEqual(budget.incomes, []);
  assert.deepEqual(budget.expenses, []);
  assert.throws(
    () => createFirstBudget(emptyBudgetState, { ...input, income: { amount: 100, date: '2026-11-18' } }, today),
    /prochaine rentrée/,
  );
  assert.throws(
    () => createFirstBudget(emptyBudgetState, { ...input, bills: [{ label: '', amount: 20, date: today }] }, today),
    /tes factures/,
  );
});

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

test('Une dette signalée en retard sans date reste dans les retards et peut être payée', () => {
  const today = '2026-05-29';
  const state = {
    ...emptyState,
    currentBalance: 500,
    debts: [debt('Arriéré sans date', 40.15, 0, undefined, 'late')],
  };
  const projection = buildProjection(state.currentBalance, [], [], state.debts, [], 50, { today });
  const [arrear] = projection.events;

  assert.equal(arrear.isLate, true);
  assert.equal(projection.lowestBalance, 459.85);
  assert.equal(getUpcomingReminders([], state.debts, [], today)[0].isLate, true);

  const paid = recordPayment(state, {
    type: 'debt', id: arrear.sourceId, today, dueDate: arrear.dueDate, balanceIncludesPayment: false,
  });
  assert.equal(paid.currentBalance, 459.85);
  assert.equal(paid.debts[0].remainingAmount, 0);
  assert.deepEqual(buildProjection(paid.currentBalance, [], [], paid.debts, [], 50, { today }).events, []);
});

test('La fin estimée tient compte des arriérés, des mois courts et d’une échéance annulée', () => {
  const date = '2026-05-29';
  const credit = {
    ...debt('Crédit', 240.15, 100, '2026-01-31', 'late'),
    occurrenceStatuses: { '2026-06-30': 'cancelled' },
  };
  const next = nextDebtOccurrence(credit, date);
  assert.equal(next.dueDate, '2026-01-31');
  assert.equal(estimateDebtEndDate(credit, next, date), '2026-07-31');
  const stopped = { ...credit, endDate: '2026-06-30' };
  assert.equal(estimateDebtEndDate(stopped, nextDebtOccurrence(stopped, date), date), undefined);
  const unscheduled = debt('Sans date', 100, 0, undefined);
  assert.equal(estimateDebtEndDate(unscheduled, nextDebtOccurrence(unscheduled, date), date), undefined);
});

test('Un paiement sans échéance met à jour le solde et le restant dû en centimes', () => {
  const state = {
    ...emptyState,
    currentBalance: 85.25,
    debts: [debt('Sans échéance', 31.20, 0, undefined)],
  };
  const payment = { id: 'Sans échéance', amount: 11.15, today: '2026-05-29', balanceIncludesPayment: false };
  const paid = recordUnscheduledDebtPayment(state, payment);
  assert.equal(paid.currentBalance, 74.10);
  assert.equal(paid.debts[0].remainingAmount, 20.05);
  assert.equal(recordUnscheduledDebtPayment(paid, { ...payment, amount: 25 }), paid);
  const completed = recordUnscheduledDebtPayment(paid, { ...payment, amount: 20.05, balanceIncludesPayment: true });
  assert.equal(completed.currentBalance, 74.10);
  assert.equal(completed.debts[0].remainingAmount, 0);
  assert.equal(completed.debts[0].status, 'completed');
});

test('Payer une facture avant la prochaine rentrée recalcule le point bas', () => {
  const today = '2026-05-29';
  const state = {
    ...emptyState,
    currentBalance: 500,
    incomes: [income(400, { frequency: 'one_time', expectedDate: '2026-06-01' })],
    expenses: [expense(100, { dueDate: '2026-06-03' })],
  };
  const before = calculateBudgetSummary(state.currentBalance, state.incomes, state.expenses, [], [], 50, [], today);
  const paid = recordPayment(state, {
    type: 'expense', id: 'expense', today, dueDate: '2026-06-03', balanceIncludesPayment: false,
  });
  const after = calculateBudgetSummary(paid.currentBalance, paid.incomes, paid.expenses, [], [], 50, [], today);

  assert.equal(before.trueAvailable, 450);
  assert.equal(paid.currentBalance, 400);
  assert.equal(after.trueAvailable, 350);
  assert.deepEqual(getUpcomingReminders(paid.expenses, [], [], today, 35).map(({ dueDate }) => dueDate), ['2026-07-03']);
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

test('La sauvegarde v2 restaure le budget complet avec les centimes et les statuts', () => {
  const budget = {
    currentBalance: -12.34,
    balanceDate: '2026-05-29',
    userProfile: mockUser,
    incomes: mockIncomes,
    expenses: [
      expense(59.90, {
        dueDate: '2026-05-29',
        occurrenceStatuses: { '2026-05-29': 'paid', '2026-06-29': 'cancelled' },
      }),
      ...mockExpenses,
    ],
    debts: mockDebts,
    childExpenses: mockChildExpenses,
    goals: mockGoals,
    mediationFile: {
      ...mockMediationFile,
      proposedPlan: {
        totalAmount: 120.50,
        monthlyPayment: 20.10,
        duration: 6,
        acceptedCreditors: ['A'],
        refusedCreditors: [],
      },
    },
    documents: mockDocuments,
  };
  const contents = serializeBudget(budget);
  assert.equal(JSON.parse(contents).version, 2);
  assert.equal(JSON.parse(contents).state.currentBalance, -1234);
  assert.deepEqual(JSON.parse(JSON.stringify(deserializeBudget(contents))), budget);
  assert.equal(serializeBudget(deserializeBudget(contents)), contents);
});

test('La date du dernier export reste locale et les anciens budgets v2 restent lisibles', () => {
  const budget = { ...emptyBudgetState, currentBalance: 129.50 };
  const previous = serializeBudget(budget);
  const stored = serializeBudget(budget, '2026-11-20');

  assert.equal(deserializeStoredBudget(previous).lastBackupDate, null);
  assert.equal(deserializeStoredBudget(stored).lastBackupDate, '2026-11-20');
  assert.equal(serializeBudget(deserializeBudget(stored)), previous);
  assert.equal(deserializeStoredBudget(stored.replace('2026-11-20', '2026-02-31')).lastBackupDate, null);
});

// La provision est ce qu'il faut déjà avoir mis de côté pour payer à temps en épargnant 1/12 par mois.
// Du 20 novembre au 15 mars, il reste 3 versements de 25 € : 300 − 75 = 225 € à réserver aujourd'hui.
// (Version précédente : 25 € seulement, ce qui laissait le disponible chuter d'un coup à l'approche de la facture.)
test('P2-2 — une taxe annuelle de 300 € dans quatre mois réserve ce qui devrait déjà être mis de côté', () => {
  const today = '2026-11-20';
  const tax = expense(300, { id: 'taxe', frequency: 'annual', dueDate: '2027-03-15' });
  const salary = income(600, { expectedDate: '2027-01-01' });
  const summary = calculateBudgetSummary(500, [salary], [tax], [], [], 50, [], today);
  assert.equal(summary.trueAvailable, 225);
  assert.equal(summary.availableForecast.balance, 500);
  assert.equal(summary.availableForecast.annualProvision, 225);
  assert.equal(summary.availableForecast.reservedAmount, 275);
  assert.equal(summary.totalMonthlyExpenses, 25);
  assert.equal(summary.savingsCapacity, 575);
});

test('P2-2 — le disponible baisse progressivement à l’approche d’une taxe annuelle, sans chute brutale', () => {
  const tax = expense(600, { id: 'taxe', frequency: 'annual', dueDate: '2027-03-15' });
  const availableOn = (today) => calculateBudgetSummary(1000, [], [tax], [], [], 50, [], today).trueAvailable;
  // 3, 1 et 1 versements restants, puis la facture entre dans la projection de 35 jours.
  assert.equal(availableOn('2026-11-20'), 500);
  assert.equal(availableOn('2027-01-15'), 450);
  assert.equal(availableOn('2027-02-05'), 400);
  assert.equal(availableOn('2027-02-10'), 350);
  // Juste après l'échéance précédente, il reste 11 versements : un douzième suffit.
  assert.equal(calculateBudgetSummary(1000, [], [expense(600, { id: 'loin', frequency: 'annual', dueDate: '2027-11-25' })],
    [], [], 50, [], '2026-11-20').availableForecast.annualProvision, 50);
});

test('P2-2 — la facture annuelle proche est comptée une fois, y compris après son paiement', () => {
  const today = '2027-03-05';
  const dueDate = '2027-03-15';
  const tax = expense(300, { id: 'taxe', frequency: 'annual', dueDate });
  const state = { ...emptyState, currentBalance: 500, expenses: [tax] };
  const summaryFor = (budget) => calculateBudgetSummary(budget.currentBalance, [], budget.expenses, [], [], 50, [], today);
  const before = summaryFor(state);
  const paid = recordPayment(state, { type: 'expense', id: 'taxe', today, dueDate, balanceIncludesPayment: false });
  const after = summaryFor(paid);
  assert.equal(before.availableForecast.date, dueDate);
  assert.equal(before.availableForecast.annualProvision, 0);
  assert.equal(paid.currentBalance, 200);
  assert.equal(after.availableForecast.annualProvision, 0);
  assert.equal(before.trueAvailable, 150);
  assert.equal(after.trueAvailable, 150);
});

test('P2-2 — une charge annuelle terminée ou sans date ne réserve aucun montant', () => {
  const today = '2026-11-20';
  const expenses = [
    expense(120, { id: 'annulee', frequency: 'annual', dueDate: '2027-03-15', endDate: '2027-03-15',
      occurrenceStatuses: { '2027-03-15': 'cancelled' } }),
    expense(240, { id: 'sans-date', frequency: 'annual' }),
  ];
  const summary = calculateBudgetSummary(500, [], expenses, [], [], 50, [], today);
  assert.equal(summary.availableForecast.annualProvision, 0);
  assert.equal(summary.trueAvailable, 450);
});

test('P2-1 — déplacer un achat après une rentrée certaine change la réponse et préserve la projection', () => {
  const today = '2026-11-20';
  const incomeDate = '2026-12-01';
  const incomes = [
    income(200, { id: 'salaire', frequency: 'one_time', expectedDate: incomeDate }),
    income(1000, { id: 'incertain', frequency: 'one_time', expectedDate: today, isConfirmed: false }),
  ];
  // Échéance dans 11 versements mensuels : la provision reste de 25 €, le test porte sur la simulation.
  const tax = expense(300, { frequency: 'annual', dueDate: '2027-11-01' });
  const { availableForecast } = calculateBudgetSummary(300, incomes, [tax], [], [], 50, [], today);
  assert.deepEqual(simulatePurchase(availableForecast, 250, today), {
    affordable: false, lowestDate: today, lowestBalance: 50, available: -25,
  });
  assert.deepEqual(simulatePurchase(availableForecast, 250, incomeDate), {
    affordable: true, lowestDate: incomeDate, lowestBalance: 250, available: 175,
  });
  assert.equal(availableForecast.dailyBalances[0].balance, 300);
  assert.equal(availableForecast.dailyBalances.at(-1).balance, 500);
});

test('P2-1 — le seuil exact, le dernier jour et les saisies invalides sont traités', () => {
  const today = '2026-11-20';
  const { availableForecast } = calculateBudgetSummary(500, [], [], [], [], 50, [], today);
  assert.deepEqual(simulatePurchase(availableForecast, 450, '2026-12-25'), {
    affordable: true, lowestDate: '2026-12-25', lowestBalance: 50, available: 0,
  });
  assert.equal(simulatePurchase(availableForecast, 450.01, '2026-12-25')?.affordable, false);
  assert.equal(simulatePurchase(availableForecast, 1, '2026-12-26'), null);
  assert.equal(simulatePurchase(availableForecast, 1, '2026-11-19'), null);
  assert.equal(simulatePurchase(availableForecast, 1, '2026-11-31'), null);
  assert.equal(simulatePurchase(availableForecast, 0, today), null);
});

test('Un fichier tronqué, incompatible ou incohérent est refusé', () => {
  const contents = serializeBudget(emptyBudgetState);
  assert.throws(() => deserializeBudget(contents.slice(0, -1)), /JSON valide/);
  assert.throws(() => deserializeBudget('{}'), /sauvegarde Boussole/);
  assert.throws(
    () => deserializeBudget(JSON.stringify({ ...JSON.parse(contents), version: 3 })),
    /version de sauvegarde/,
  );

  const invalidFields = [
    [{ incomes: null }, /budget\.incomes/],
    [{ balanceDate: '2026-02-30' }, /budget\.balanceDate/],
    [{ userProfile: { ...emptyBudgetState.userProfile, safetyReserve: 5.25 } }, /safetyReserve/],
    [{ expenses: [expense(200, { occurrenceStatuses: { '2026-05-29': 'remboursé' } })] }, /occurrenceStatuses/],
    [{ debts: [debt('d1', -1, 100, '2026-05-29')] }, /remainingAmount/],
    [{ goals: [{ ...mockGoals[0], status: 'inconnu' }] }, /budget\.goals\[0\]\.status/],
    [{ documents: [mockDocuments[0], mockDocuments[0]] }, /Identifiants en double/],
  ];
  for (const [fields, error] of invalidFields) {
    const raw = JSON.parse(contents);
    Object.assign(raw.state, fields);
    assert.throws(() => deserializeBudget(JSON.stringify(raw)), error);
  }
});

test('Les montants négatifs des dettes sont refusés en v1 et à l’enregistrement', () => {
  const invalid = {
    ...emptyBudgetState,
    debts: [debt('d1', 40, -10, '2026-05-29')],
  };
  assert.throws(() => serializeBudget(invalid), /monthlyPayment/);
  assert.throws(() => migrateLegacyBudget(JSON.stringify(invalid), emptyBudgetState, '2026-05-29'), /monthlyPayment/);
});

test('Une sauvegarde devenue obsolète ne peut pas écraser le stockage', () => {
  const legacy = '{"currentBalance":321.45}';
  const map = new Map([[LEGACY_BUDGET_STORAGE_KEY, legacy]]);
  const storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
  const contents = serializeBudget(emptyBudgetState);
  const first = readBudgetSnapshot(storage);
  writeBudgetSnapshot(storage, first, contents);
  assert.equal(map.get(LEGACY_BUDGET_STORAGE_KEY), legacy);
  assert.equal(map.get(BUDGET_STORAGE_KEY), contents);

  const second = readBudgetSnapshot(storage);
  const concurrent = serializeBudget({ ...emptyBudgetState, currentBalance: 42 });
  map.set(BUDGET_STORAGE_KEY, concurrent);
  assert.throws(() => writeBudgetSnapshot(storage, second, contents), /autre onglet/);
  assert.equal(map.get(BUDGET_STORAGE_KEY), concurrent);

  const fullStorage = { ...storage, setItem: () => { throw new Error('quota'); } };
  assert.throws(() => writeBudgetSnapshot(fullStorage, readBudgetSnapshot(storage), contents), /intact/);
  assert.equal(map.get(BUDGET_STORAGE_KEY), concurrent);
});
