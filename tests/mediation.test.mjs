import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBudgetSummary } from '../lib/budget-calculations.ts';
import { deserializeBudget, emptyBudgetState, isBudgetEmptyForSync, serializeBudget } from '../lib/budget-state.ts';
import { decideSync } from '../lib/cloud-sync.ts';

const budget = {
  ...emptyBudgetState,
  currentBalance: 480,
  balanceDate: '2026-11-20',
  incomes: [{
    id: 'pecule',
    label: 'Pécule',
    type: 'other',
    amount: 485.25,
    frequency: 'monthly',
    expectedDate: '2026-11-25',
    isConfirmed: true,
  }],
};

const tracked = {
  ...budget,
  mediationFile: {
    status: 'plan_accepted',
    procedure: 'collective',
    allowanceIncomeId: 'pecule',
    nextAppointment: '2026-12-02',
    steps: [],
    questionsForMediator: ['Quand le versement est-il prévu ?'],
    proposedPlan: {
      totalAmount: 2400.15,
      monthlyPayment: 120.25,
      duration: 20,
      acceptedCreditors: ['Créancier A'],
      refusedCreditors: ['Créancier B'],
    },
  },
};

test('P2-6 — la référence du pécule et les données du plan restent dans la sauvegarde v2', () => {
  const contents = serializeBudget(tracked);
  const stored = JSON.parse(contents);
  const restored = deserializeBudget(contents);

  assert.equal(stored.version, 2);
  assert.equal(stored.state.mediationFile.proposedPlan.monthlyPayment, 12025);
  assert.deepEqual(restored.mediationFile, tracked.mediationFile);
  assert.deepEqual(restored.incomes, tracked.incomes);
  assert.equal(serializeBudget(restored), contents);
});

test('P2-6 — l’ancien dossier est lisible sans type de suivi ni rentrée associée', () => {
  const { procedure, allowanceIncomeId, ...previousFile } = tracked.mediationFile;
  assert.equal(procedure, 'collective');
  assert.equal(allowanceIncomeId, 'pecule');
  const previous = { ...budget, mediationFile: previousFile };

  assert.deepEqual(deserializeBudget(serializeBudget(previous)).mediationFile, previousFile);
});

test('P2-6 — associer le pécule et enregistrer un plan ne dédouble aucun flux', () => {
  const summarize = (state) => calculateBudgetSummary(
    state.currentBalance, state.incomes, state.expenses, state.debts, state.childExpenses,
    state.userProfile.safetyReserve, state.goals, '2026-11-20',
  );
  const before = summarize(budget);
  const after = summarize(deserializeBudget(serializeBudget(tracked)));

  assert.equal(after.totalMonthlyIncome, 485.25);
  assert.deepEqual(after, before);
});

test('P2-6 — un dossier seul peut créer une copie et déclenche un conflit devant une copie existante', () => {
  const onlyMediation = deserializeBudget(serializeBudget({
    ...emptyBudgetState,
    mediationFile: { ...emptyBudgetState.mediationFile, proposedPlan: tracked.mediationFile.proposedPlan },
  }));
  const localIsEmpty = isBudgetEmptyForSync(onlyMediation, true);
  const input = { memory: null, localFingerprint: 'dossier-local', localIsEmpty };

  assert.equal(localIsEmpty, false);
  assert.deepEqual(decideSync({ ...input, remoteVersion: null }), { action: 'create' });
  assert.deepEqual(decideSync({ ...input, remoteVersion: 4 }), { action: 'conflict' });
});

test('P2-6 — un rendez-vous, une note ou une autre donnée du dossier suffit à préserver le budget', () => {
  const emptyFile = emptyBudgetState.mediationFile;
  const details = {
    status: 'in_progress',
    mediatorName: 'Camille',
    mediatorOrganization: 'Service fictif',
    procedure: 'amicable',
    allowanceIncomeId: 'ancienne-rentree',
    startDate: '2026-11-01',
    nextAppointment: '2026-12-02',
    proposedPlan: tracked.mediationFile.proposedPlan,
    steps: [{ id: 'rdv', date: '2026-12-02', title: 'Rendez-vous', description: '', status: 'pending' }],
    questionsForMediator: ['Question pour le rendez-vous'],
  };

  for (const [key, value] of Object.entries(details)) {
    const local = { ...emptyBudgetState, mediationFile: { ...emptyFile, [key]: value } };
    assert.equal(isBudgetEmptyForSync(local, true), false, key);
  }
});

test('P2-6 — un dossier vierge laisse un budget vide récupérer la copie en ligne', () => {
  const localIsEmpty = isBudgetEmptyForSync(emptyBudgetState, true);
  const decision = decideSync({ remoteVersion: 4, memory: null, localFingerprint: 'budget-vide', localIsEmpty });

  assert.equal(localIsEmpty, true);
  assert.deepEqual(decision, { action: 'pull' });
});
