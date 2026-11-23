import assert from 'node:assert/strict';
import test from 'node:test';
import { passedOccurrences, updateBalance } from '../lib/balance-update.ts';
import { calculateBudgetSummary, formatCurrency } from '../lib/budget-calculations.ts';
import { deserializeStoredBudget, emptyBudgetState, recordPayment, serializeBudget } from '../lib/budget-state.ts';
import {
  applyContributionMirrorChanges, contributionMirrorNeedsUpdate, contributionMirrorPlan, contributionOccurrences,
  householdAttention, mirrorContributions, trustedContributionSchedules,
} from '../lib/household-contributions.ts';
import { householdCopy } from '../lib/household-copy.ts';
import { materializeHousehold } from '../lib/household-materialize.ts';
import { analyzeMonth } from '../lib/spending-analysis.ts';

process.env.TZ = 'Europe/Brussels';

const today = '2026-11-25';
const sam = 'membre-sam';
const marc = 'membre-marc';
const contribution = (memberId, amount, date = '2026-11-28') => ({
  id: memberId, contributionMemberId: memberId, type: 'household_contribution',
  label: householdCopy.contribution, amount, expectedDate: date, frequency: 'monthly', isConfirmed: false,
});
const expense = (amount, date = '2026-12-01', label = 'loyer') => ({
  id: label, label, amount, dueDate: date, category: 'rent', frequency: 'monthly', isPaid: false, isRecurring: true,
});
const budget = (currentBalance, expenses = [], incomes = []) => ({
  ...emptyBudgetState, currentBalance, balanceDate: today, expenses, incomes,
});
const summary = (state) => calculateBudgetSummary(
  state.currentBalance, state.incomes, state.expenses, [], [], 50, [], today,
);
const received = (id, dueDate = '2026-11-28') => ({ type: 'income', id, dueDate });

test('F-A · deux versements incertains, puis un reçu sans double comptage', () => {
  const state = budget(500, [expense(900)], [contribution(sam, 300), contribution(marc, 300)]);
  const projection = summary(state);
  assert.equal(projection.trueAvailable, -450);
  assert.equal(projection.availableForecast.balance, -400);
  assert.equal(projection.availableForecast.date, '2026-12-01');
  assert.equal(projection.availableForecast.optimisticAvailable, 150);
  const pending = contributionOccurrences(state.incomes, today, '2026-12-30').filter(({ status }) => status === 'planned');
  assert.equal(pending.length, 4);
  assert.equal(pending.reduce((total, item) => total + item.amountCents, 0), 120000);
  assert.equal(householdAttention(state, today), 'Le paiement du loyer du 1er dépend de 2 versements encore attendus');

  const payment = { ...received(sam), today, balanceIncludesPayment: false };
  const next = recordPayment(state, payment);
  assert.equal(next.currentBalance, 800);
  assert.equal(summary(next).trueAvailable, -150);
  assert.equal(summary(next).availableForecast.optimisticAvailable, 150);
  const occurrences = contributionOccurrences(next.incomes, today, '2026-12-30');
  assert.equal(occurrences.filter(({ status }) => status === 'paid').length, 1);
  assert.equal(occurrences.filter(({ status }) => status === 'planned').length, 3);
  assert.equal(occurrences.filter(({ status }) => status === 'planned').reduce((total, item) => total + item.amountCents, 0), 90000);
  assert.equal(recordPayment(next, payment), next);
});

test('F2 · un versement arrivé après sa date reste confirmable et peut déjà figurer dans le solde recopié', () => {
  const state = budget(500, [], [contribution(sam, 300)]);
  const later = '2026-11-29';
  const occurrence = received(sam);
  assert.ok(passedOccurrences(state, later).some(({ id, dueDate }) => id === sam && dueDate === occurrence.dueDate));
  const recorded = recordPayment(state, { ...occurrence, today: later, balanceIncludesPayment: false });
  assert.equal(recorded.currentBalance, 800);
  assert.equal(recorded.incomes[0].occurrenceStatuses[occurrence.dueDate], 'paid');
  const recap = updateBalance(state, { amount: 800, today: later, settled: [occurrence] });
  assert.equal(recap.currentBalance, 800);
  assert.equal(recap.incomes[0].occurrenceStatuses[occurrence.dueDate], 'paid');
  assert.equal(recap.balanceGaps, undefined);
});

test('F3 · un loyer couvert entame seulement la réserve', () => {
  const state = budget(1000, [expense(970)], [contribution(sam, 100)]);
  assert.equal(householdAttention(state, today), `La réserve serait entamée de ${formatCurrency(20)} le 1 déc.`);
});

test('F3 · la dépendance est affichée uniquement si le versement couvre le point de passage sous zéro', () => {
  const state = (amount) => budget(500, [expense(970, '2026-12-05')], [contribution(sam, amount, '2026-12-03')]);
  assert.equal(householdAttention(state(600), today), 'Le paiement du loyer du 5 dépend d’un versement encore attendu');
  assert.equal(householdAttention(state(470), today), 'Le paiement du loyer du 5 dépend d’un versement encore attendu');
  assert.equal(householdAttention(state(300), today), `${formatCurrency(470)} supplémentaires sont nécessaires avant le 5 déc. pour couvrir les échéances prévues`);
});

test('F3 · la première échéance couverte par un versement prime sur un point bas ultérieur', () => {
  const state = budget(500, [expense(970, '2026-12-05'), expense(250, '2026-12-09', 'assurance')], [contribution(sam, 600, '2026-12-03')]);
  assert.equal(householdAttention(state, today), 'Le paiement du loyer du 5 dépend d’un versement encore attendu');
});

test('F3 · l’alerte décrit le solde d’aujourd’hui, et disparaît à partir de la réserve', () => {
  assert.equal(householdAttention(budget(-10), today), 'Le solde du compte commun est déjà sous zéro.');
  assert.equal(householdAttention(budget(30), today), `Le solde est déjà sous la réserve de ${formatCurrency(20)}.`);
  assert.equal(householdAttention(budget(50), today), null);
  assert.equal(householdAttention(budget(51), today), null);
  assert.equal(householdAttention(budget(500, [{ ...expense(970, today), endDate: today }]), today),
    `${formatCurrency(470)} supplémentaires sont nécessaires avant le 25 nov. pour couvrir les échéances prévues`);
});

test('F-C · miroir certain, réservé au membre concerné et compté à part une seule fois', () => {
  const personal = budget(2000);
  const sharedIncome = contribution(sam, 800);
  const incomes = [sharedIncome, contribution(marc, 300)];
  const withMirror = mirrorContributions(personal, 'foyer-1', sam, incomes);
  assert.equal(withMirror.expenses.length, 1);
  const [mirror] = withMirror.expenses;
  assert.equal(mirror.amount, 800);
  assert.equal(mirror.category, 'household');
  assert.ok(mirror.linkedRecordId);
  assert.equal(withMirror.currentBalance, 2000);
  assert.equal(summary(withMirror).trueAvailable, 350);
  assert.equal(mirrorContributions(withMirror, 'foyer-1', sam, incomes), withMirror);
  assert.equal(mirrorContributions(personal, 'foyer-1', 'autre-membre', incomes), personal);

  const paid = recordPayment(withMirror, { type: 'expense', id: mirror.id, dueDate: '2026-11-28', today, balanceIncludesPayment: false });
  const analysis = analyzeMonth(paid, '2026-11');
  assert.equal(analysis.totalCents, 0);
  assert.equal(analysis.transfersCents, 80000);
  assert.deepEqual(analysis.rows, []);
  const loaded = deserializeStoredBudget(serializeBudget(paid)).budget;
  const updated = mirrorContributions(loaded, 'foyer-1', sam, [{ ...sharedIncome, amount: 850 }]);
  assert.equal(updated.expenses.length, 1);
  assert.equal(updated.expenses[0].amount, 850);
  assert.equal(updated.expenses[0].occurrenceStatuses['2026-11-28'], 'paid');
  assert.equal(updated.currentBalance, 1200);
  assert.equal(analyzeMonth(updated, '2026-11').transfersCents, 80000);
  assert.equal(summary(budget(500, [], [sharedIncome])).trueAvailable, 450);
});

test('F2 · le montant reçu reste exact après une modification de la date ou du montant prévu', () => {
  const state = budget(500, [], [contribution(sam, 300)]);
  const paid = recordPayment(state, { ...received(sam), today, balanceIncludesPayment: false });
  const incomes = [{ ...paid.incomes[0], amount: 400, expectedDate: '2026-12-03' }];
  const history = contributionOccurrences(incomes, '2026-11-01', '2026-11-30');
  assert.deepEqual(history.map(({ dueDate, status, amountCents }) => [dueDate, status, amountCents]), [
    ['2026-11-28', 'paid', 30000],
  ]);
});

test('F1 · un versement importé dans le foyer reste incertain jusqu’à sa réception', () => {
  const income = { ...contribution(sam, 30000), isConfirmed: true };
  const state = materializeHousehold([{ seq: 1, record: { kind: 'income', id: income.id, data: income } }]);
  assert.equal(state.incomes[0].amount, 300);
  assert.equal(state.incomes[0].isConfirmed, false);
});

test('F6 · seul un versement saisi sur cet appareil ou validé sous le compte concerné peut changer sa ligne miroir', () => {
  const own = contribution(sam, 800);
  const row = { seq: 3, record: { kind: 'income', id: own.id, data: own } };
  assert.deepEqual(trustedContributionSchedules([own], [{ ...row, updatedBy: 'compte-sam' }], 'compte-sam', 3), [own]);
  assert.deepEqual(trustedContributionSchedules([own], [{ ...row, updatedBy: 'compte-marc' }], 'compte-sam', 3), []);
  assert.deepEqual(trustedContributionSchedules([own], [row], 'compte-sam', 2), [own]);
});

test('F6 · un versement proposé par l’autre compte attend un accord pour sa création et sa modification', () => {
  const personal = budget(2000);
  const income = contribution(sam, 600);
  const row = (seq, data) => ({ seq, updatedBy: 'compte-marc', record: { kind: 'income', id: income.id, data } });
  const first = contributionMirrorPlan([income], [row(4, income)], 'compte-sam', sam, 4);
  assert.equal(first.automatic.length, 0);
  const [offer] = first.proposals;
  assert.ok(contributionMirrorNeedsUpdate(personal.expenses, 'foyer-1', offer));
  assert.equal(applyContributionMirrorChanges(personal, 'foyer-1', sam, first.automatic, today), personal);

  const accepted = applyContributionMirrorChanges(personal, 'foyer-1', sam, [offer], today);
  assert.equal(accepted.expenses[0].amount, 600);
  assert.equal(contributionMirrorNeedsUpdate(accepted.expenses, 'foyer-1', offer), false);
  const proposedEdit = { ...income, amount: 700 };
  const edit = contributionMirrorPlan([proposedEdit], [row(5, proposedEdit)], 'compte-sam', sam, 5);
  assert.equal(edit.automatic.length, 0);
  assert.ok(contributionMirrorNeedsUpdate(accepted.expenses, 'foyer-1', edit.proposals[0]));
  assert.equal(applyContributionMirrorChanges(accepted, 'foyer-1', sam, edit.automatic, today), accepted);
  assert.equal(accepted.expenses[0].amount, 600);
  const updated = applyContributionMirrorChanges(accepted, 'foyer-1', sam, edit.proposals, today);
  assert.equal(updated.expenses.length, 1);
  assert.equal(updated.expenses[0].amount, 700);
  assert.equal(applyContributionMirrorChanges(updated, 'foyer-1', sam, [offer], today), updated);
});

test('F6 · suppression ou réattribution clôture le miroir et laisse le paiement dans l’analyse', () => {
  const income = contribution(sam, 800, '2026-10-25');
  const record = (seq, data) => ({ seq, updatedBy: 'compte-sam', record: { kind: 'income', id: income.id, data } });
  const first = contributionMirrorPlan([income], [record(4, income)], 'compte-sam', sam, 4);
  const created = applyContributionMirrorChanges(budget(2000), 'foyer-1', sam, first.automatic, today);
  const [mirror] = created.expenses;
  const paid = recordPayment(created, { type: 'expense', id: mirror.id, dueDate: '2026-10-25', today, balanceIncludesPayment: false });
  const reassigned = { ...income, contributionMemberId: marc };

  for (const [incomes, row] of [[[], record(7)], [[reassigned], record(7, reassigned)]]) {
    const closedPlan = contributionMirrorPlan(incomes, [row], 'compte-sam', sam, 7);
    const closed = applyContributionMirrorChanges(paid, 'foyer-1', sam, closedPlan.automatic, today);
    assert.equal(closed.expenses.length, 1);
    assert.equal(closed.expenses[0].endDate, today);
    assert.equal(closed.expenses[0].occurrenceStatuses['2026-10-25'], 'paid');
    assert.equal(closed.currentBalance, 1200);
    assert.equal(analyzeMonth(closed, '2026-10').transfersCents, 80000);
    assert.equal(summary(closed).trueAvailable, 1150);
    assert.equal(summary(closed).totalMonthlyExpenses, 0);
    assert.equal(applyContributionMirrorChanges(closed, 'foyer-1', sam, first.automatic, today), closed);
    assert.equal(applyContributionMirrorChanges(closed, 'foyer-1', sam, closedPlan.automatic, today), closed);
  }

  const uncached = contributionMirrorPlan([], [], 'compte-sam', sam, 0);
  assert.equal(applyContributionMirrorChanges(paid, 'foyer-1', sam, uncached.automatic, today), paid);
});
