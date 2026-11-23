import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBudgetSummary } from '../lib/budget-calculations.ts';
import { mockGoals } from '../lib/mock-data.ts';
import { toCents } from '../lib/money.ts';
import { scenarios as projectionScenarios } from './browser/projection-scenarios.mjs';
import { scenarios as budgetScenarios, today } from './browser/budget-scenarios.mjs';

const summaryOf = (s, goals = s.goals ?? []) => calculateBudgetSummary(s.currentBalance, s.incomes, s.expenses, s.debts, s.childExpenses,
  s.userProfile.safetyReserve, goals, today, { envelopes: s.envelopes ?? [], spendings: s.spendings ?? [] });

const cases = [];
for (const [name, s] of Object.entries({ ...projectionScenarios, ...budgetScenarios })) {
  cases.push([name, s, s.goals ?? []]);
  cases.push([`${name} + objectifs à part`, s, mockGoals.map((goal) => ({ ...goal, onCurrentAccount: false }))]);
  cases.push([`${name} + objectifs sur le compte`, s, mockGoals.map((goal) => ({ ...goal, onCurrentAccount: true }))]);
}

test('Vrai disponible en escalier : les lignes retombent au centime sur le moteur, pour chaque budget de test', () => {
  assert.ok(cases.length >= 24, `${cases.length} cas`);
  for (const [name, s, goals] of cases) {
    const summary = summaryOf(s, goals);
    if (summary.emptyBudget) continue;
    const { breakdown: b, balance, reservedAmount } = summary.availableForecast;
    const cents = (value) => toCents(value);
    assert.equal(b.balance, s.currentBalance, `${name} : solde`);
    assert.equal(cents(b.balance) + cents(b.incomes) - cents(b.charges) - cents(b.envelopes) - cents(b.savingsTransfers), cents(balance), `${name} : point bas`);
    assert.equal(b.lowest, balance, `${name} : point bas`);
    assert.equal(cents(b.safetyReserve) + cents(b.annualProvision) + cents(b.goalSavings), cents(reservedAmount), `${name} : réserve`);
    assert.equal(b.available, summary.trueAvailable, `${name} : vrai disponible`);
    for (const key of ['incomes', 'charges', 'envelopes', 'savingsTransfers']) assert.ok(b[key] >= 0, `${name} : ${key} positif`);
  }
});

test('Prochaine rentrée : la première rentrée certaine à venir, jamais une rentrée incertaine ou en retard', async () => {
  const { nextCertainIncome } = await import('../lib/available-breakdown.ts');
  const event = (date, amount, fields = {}) => ({ id: date, sourceId: 's', date, dueDate: date, label: `R ${date}`, amount, type: 'income', isEstimated: false, isLate: false, ...fields });
  assert.deepEqual(nextCertainIncome([
    event('2026-06-15', 300),
    event('2026-06-01', 1600, { label: 'Salaire' }),
    event('2026-05-29', 200, { isLate: true }),
    event('2026-05-30', 500, { isEstimated: true }),
    { ...event('2026-05-31', -650), type: 'expense' },
  ]), { label: 'Salaire', amount: 1600, date: '2026-06-01' });
  assert.equal(nextCertainIncome([event('2026-06-01', 500, { isEstimated: true })]), undefined);
  // Sur les budgets de test : cohérent avec les revenus confirmés.
  for (const [name, s] of Object.entries(projectionScenarios)) {
    const next = summaryOf(s).availableForecast.nextIncome;
    if (next) assert.ok(s.incomes.some(({ label, isConfirmed }) => isConfirmed && next.label.includes(label)), `${name} : ${next.label}`);
  }
});
