import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBudgetSummary } from '../lib/budget-calculations.ts';
import { goalOccurrences, goalReserveOnAccount, goalSavingsOnAccountCents, recordGoalContribution, reserveExtras } from '../lib/goals.ts';
import { buildProjection } from '../lib/projection.ts';

const goal = (fields) => ({ id: 'g', label: 'Voyage', targetAmount: 600, savedAmount: 100, status: 'realistic', ...fields });
const today = '2026-05-20';

test('Objectifs · mise de côté du mois en cours puis le 1er de chaque mois, jamais au-delà du reste à épargner', () => {
  assert.deepEqual(goalOccurrences([goal({ monthlyContribution: 50 })], today, '2026-07-10')
    .map(({ dueDate, amountCents, label }) => [dueDate, amountCents, label]),
  [['2026-05-20', -5000, 'Mise de côté : Voyage'], ['2026-06-01', -5000, 'Mise de côté : Voyage'], ['2026-07-01', -5000, 'Mise de côté : Voyage']]);
  // Déjà fait ce mois-ci : seulement les mois suivants.
  assert.deepEqual(goalOccurrences([goal({ monthlyContribution: 50, lastContributionMonth: '2026-05' })], today, '2026-06-24')
    .map(({ dueDate }) => dueDate), ['2026-06-01']);
  // Il ne reste que 70 € : 50 puis 20, puis plus rien.
  assert.deepEqual(goalOccurrences([goal({ savedAmount: 530, monthlyContribution: 50 })], today, '2026-08-10')
    .map(({ amountCents }) => amountCents), [-5000, -2000]);
  // Objectif atteint ou sans mise de côté : rien.
  assert.equal(goalOccurrences([goal({ savedAmount: 600, monthlyContribution: 50 }), goal({ id: 'h' })], today, '2026-08-10').length, 0);
});

test('Objectifs · compte courant : épargne et mise de côté du mois réservées, aucune sortie ; compte à part : sorties', () => {
  const onAccount = goal({ onCurrentAccount: true, monthlyContribution: 50 });
  // 100 € déjà épargnés + la mise de côté de mai ; celle de juin sera réservée en juin (payée par les revenus de juin).
  assert.deepEqual(goalReserveOnAccount([onAccount, goal({ id: 'h', savedAmount: 40, monthlyContribution: 50 })], today), { savedCents: 10000, thisMonthCents: 5000 });
  assert.equal(goalSavingsOnAccountCents([onAccount], today), 15000);
  // Mise de côté du mois déjà faite : seulement l'épargne.
  assert.equal(goalSavingsOnAccountCents([goal({ onCurrentAccount: true, monthlyContribution: 50, lastContributionMonth: '2026-05' })], today), 10000);
  assert.equal(goalOccurrences([onAccount], today, '2026-06-24').length, 0, 'l’argent ne quitte pas le compte');
  assert.equal(goalSavingsOnAccountCents([goal({})], today), 0);
});

test('Objectifs · « J’ai mis de côté » augmente l’épargne et marque le mois, sans dépasser l’objectif', () => {
  assert.deepEqual(recordGoalContribution(goal({ monthlyContribution: 50 }), today), { savedAmount: 150, lastContributionMonth: '2026-05' });
  assert.deepEqual(recordGoalContribution(goal({ savedAmount: 580, monthlyContribution: 50 }), today), { savedAmount: 600, lastContributionMonth: '2026-05' });
  assert.deepEqual(recordGoalContribution(goal({ savedAmount: 0.1, monthlyContribution: 0.2 }), today), { savedAmount: 0.3, lastContributionMonth: '2026-05' });
});

test('Objectifs · le vrai disponible baisse exactement des mises de côté à venir et de l’épargne gardée sur le compte', () => {
  // Sans revenu dans la période : chaque mise de côté fait baisser le point bas.
  const base = [1000, [], [], [], [], 50];
  const without = buildProjection(...base, { today, horizon: 35 });
  const separate = buildProjection(...base, { today, horizon: 35, goals: [goal({ monthlyContribution: 50 })] });
  const onAccount = buildProjection(...base, { today, horizon: 35, goals: [goal({ monthlyContribution: 50, onCurrentAccount: true })] });
  // Horizon du 20 mai au 24 juin : mise de côté de mai (aujourd'hui) et de juin.
  assert.equal(Math.round((without.available - separate.available) * 100), 2 * 5000);
  assert.equal(Math.round((without.available - onAccount.available) * 100), 10000 + 5000);
  assert.equal(onAccount.goalSavings, 150);
  assert.equal(onAccount.reservedAmount, 200);
  // Épargne sur le compte : le solde prévu ne bouge pas, donc jamais de faux « découvert ».
  assert.deepEqual(onAccount.dailyBalances, without.dailyBalances);
  assert.equal(onAccount.events.some(({ type }) => type === 'goal'), false);
  assert.equal(separate.events.filter(({ type }) => type === 'goal').length, 2);
  // Résumé de l'accueil : même calcul.
  const summary = calculateBudgetSummary(1000, [], [], [], [], 50, [goal({ monthlyContribution: 50, onCurrentAccount: true })], today);
  assert.equal(summary.trueAvailable, onAccount.available);
  assert.equal(summary.availableForecast.goalSavings, 150);
  assert.equal(summary.availableForecast.goalThisMonth, 50);
});

test('Objectifs · une rentrée avant la mise de côté la couvre : seul le point bas compte', () => {
  const salary = [{ id: 'i', label: 'Salaire', type: 'salary', amount: 1500, frequency: 'monthly', expectedDate: '2026-06-01', isConfirmed: true }];
  const without = buildProjection(1000, salary, [], [], [], 50, { today, horizon: 35 });
  const withGoal = buildProjection(1000, salary, [], [], [], 50, { today, horizon: 35, goals: [goal({ monthlyContribution: 50 })] });
  assert.equal(Math.round((without.available - withGoal.available) * 100), 5000, 'seule la mise de côté de mai précède le salaire');
});

test('Objectifs · un budget sans objectif garde exactement le même vrai disponible', () => {
  const income = [{ id: 'i', label: 'Salaire', type: 'salary', amount: 1500, frequency: 'monthly', expectedDate: '2026-06-01', isConfirmed: true }];
  const a = calculateBudgetSummary(1000, income, [], [], [], 50, [], today);
  const b = calculateBudgetSummary(1000, income, [], [], [], 50, [goal({})], today);
  assert.equal(a.trueAvailable, b.trueAvailable, 'objectif sans mise de côté ni épargne sur le compte');
});

test('Objectifs · la réserve se dit en toutes lettres', () => {
  assert.equal(reserveExtras(0, 0), '');
  assert.equal(reserveExtras(10, 0), ' et tes provisions');
  assert.equal(reserveExtras(0, 10), ' et ton épargne');
  assert.equal(reserveExtras(10, 10), ', tes provisions et ton épargne');
});
