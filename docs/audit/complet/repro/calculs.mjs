// À lancer depuis la racine avec Node 22+.
// TZ=Europe/Brussels node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON docs/audit/complet/repro/calculs.mjs
import { isDeepStrictEqual } from 'node:util';
import { buildProjection } from '../../../../lib/projection.ts';
import { calculateBudgetSummary, assessGoalFeasibility, formatCurrency } from '../../../../lib/budget-calculations.ts';
import { annualProvisionsCents } from '../../../../lib/annual-provisions.ts';
import { expenseOccurrences, incomeOccurrences, isOpenOccurrence } from '../../../../lib/occurrences.ts';
import { fromCents, toCents, parseAmountInput } from '../../../../lib/money.ts';
import { addDays, daysBetween, todayInBrussels } from '../../../../lib/local-date.ts';
import { updateBalance, passedOccurrences } from '../../../../lib/balance-update.ts';
import { emptyBudgetState, recordPayment, serializeBudget, deserializeStoredBudget } from '../../../../lib/budget-state.ts';
import { addSpending } from '../../../../lib/spending.ts';
import { analyzeMonth } from '../../../../lib/spending-analysis.ts';
import { labelBreakdown } from '../../../../lib/label-breakdown.ts';
import { savingsTip } from '../../../../lib/savings-tip.ts';
import { chartParts } from '../../../../lib/chart-parts.ts';
import { goalSavingsOnAccountCents, goalOccurrences, recordGoalContribution } from '../../../../lib/goals.ts';
import { nextDebtOccurrence, estimateDebtEndDate } from '../../../../lib/debt-payoff.ts';
import { simulatePurchase } from '../../../../lib/purchase-simulation.ts';

const today = '2026-11-23';
const end = '2026-12-28';
const expense = (fields = {}) => ({
  id: 'charge', label: 'Charge', category: 'housing', amount: 110.01,
  frequency: 'one_time', isRecurring: false, isPaid: false, dueDate: '2026-11-22', ...fields,
});
const income = (fields = {}) => ({
  id: 'paie', label: 'Paie', type: 'salary', amount: 500,
  frequency: 'monthly', isConfirmed: true, expectedDate: '2026-12-01', ...fields,
});
const goal = (fields = {}) => ({
  id: 'voyage', label: 'Voyage', targetAmount: 500, savedAmount: 50.04, monthlyContribution: 20,
  onCurrentAccount: true, status: 'realistic', ...fields,
});
const debt = (fields = {}) => ({
  id: 'dette', creditor: 'Créancier', label: 'Dette', remainingAmount: 175.30, initialAmount: 175.30,
  monthlyPayment: 100, nextDueDate: '2026-11-29', status: 'to_pay', ...fields,
});
const spending = (fields = {}) => ({
  id: 'cafe', label: 'Café', category: 'restaurants', amount: 3.51, date: today,
  balanceIncluded: false, ...fields,
});
const base = (fields = {}) => ({ ...emptyBudgetState, currentBalance: 400, balanceDate: today, ...fields });
function summary(state, date = today) {
  return calculateBudgetSummary(state.currentBalance, state.incomes, state.expenses, state.debts,
    state.childExpenses, state.userProfile.safetyReserve, state.goals, date, state);
}
const results = [];
function check(id, expected, observed) {
  const status = isDeepStrictEqual(expected, observed) ? 'OK' : 'ÉCART';
  results.push(status);
  console.log(JSON.stringify({ id, status, expected, observed }));
}

const annual = expense({ id: 'prime', isRecurring: true, frequency: 'annual', dueDate: '2027-03-15', amount: 120 });
const estimate = income({ id: 'prime-incertaine', expectedDate: today, amount: 60, isConfirmed: false });
const pro = calculateBudgetSummary(400, [income(), estimate], [expense(), annual], [], [], 20.11, [goal()], today);
check('P01 projection et escalier', [35, end, 36, today, 289.99, 90, 70.04, 109.84, 109.84, '2026-12-01', 500], [
  pro.availableForecast.horizon, pro.availableForecast.dailyBalances.at(-1).date, pro.availableForecast.dailyBalances.length,
  pro.availableForecast.date, pro.availableForecast.balance, pro.availableForecast.annualProvision, pro.availableForecast.goalSavings,
  pro.trueAvailable, pro.availableForecast.breakdown.available, pro.availableForecast.nextIncome?.date, pro.availableForecast.nextIncome?.amount,
]);
check('P02 retard déplacé à J0', [['2026-11-22', today, true]], buildProjection(400, [], [expense()], [], [], 0, { today }).events.map(x => [x.dueDate, x.date, x.isLate]));

const cadence = (frequency, anchor, limit, start = anchor, fields = {}) =>
  expenseOccurrences(expense({ frequency, isRecurring: true, dueDate: anchor, ...fields }), start, limit).map(x => x.dueDate);
check('P03 fréquences', [
  ['2028-02-23', '2028-03-01', '2028-03-08'],
  ['2028-01-31', '2028-03-31', '2028-05-31'],
  ['2028-01-31', '2028-04-30', '2028-07-31'],
  ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'],
  ['2028-01-31', '2028-02-29', '2028-03-31'],
  ['2027-01-31', '2027-02-28'],
  ['2028-01-31'],
], [
  cadence('weekly', '2028-02-23', '2028-03-08'), cadence('bi_monthly', '2028-01-31', '2028-05-31'),
  cadence('quarterly', '2028-01-31', '2028-07-31'), cadence('annual', '2028-02-29', '2032-02-29'),
  cadence('monthly', '2028-01-31', '2028-03-31', '2028-01-31', { endDate: '2028-03-31' }),
  cadence('monthly', '2027-01-31', '2027-02-28'), cadence('one_time', '2028-01-31', '2028-05-31'),
]);
const recurring = expense({ dueDate: '2026-11-01', trackedFrom: '2026-11-01', frequency: 'weekly', isRecurring: true,
  occurrenceStatuses: { '2026-11-01': 'paid', '2026-11-08': 'cancelled' } });
check('P04 payé annulé retard', ['2026-11-15', '2026-11-22'], expenseOccurrences(recurring, today, today).filter(isOpenOccurrence).map(x => x.dueDate));
check('P05 réserve annuelle progressive puis facturation', [9000, 10000, 0], [
  annualProvisionsCents([annual], today, end),
  annualProvisionsCents([annual], '2026-12-23', '2027-01-27'),
  annualProvisionsCents([annual], '2027-02-15', '2027-03-22'),
]);

const envelope = { id: 'courses', label: 'Courses', category: 'groceries', monthlyAmount: 100 };
const grocery = spending({ date: today, category: 'groceries', amount: 30 });
const envelopeBudget = base({ envelopes: [envelope], incomes: [income()] });
const alreadyIncluded = addSpending(envelopeBudget, { ...grocery, balanceIncluded: true }, today);
const debit = addSpending(envelopeBudget, grocery, today);
check('P06 enveloppe et aucune double déduction', [400, 370, 280, 250], [
  alreadyIncluded.currentBalance, debit.currentBalance, summary(alreadyIncluded).trueAvailable, summary(debit).trueAvailable,
]);
const repaid = updateBalance(base({ balanceDate: '2026-11-21', expenses: [expense()] }), {
  amount: 280.01, today, settled: [{ type: 'expense', id: 'charge', dueDate: '2026-11-22' }],
});
check('P07 rapprochement d’une charge', [280.01, 9.98, 'paid'], [
  repaid.currentBalance, repaid.balanceGaps[0].amount, repaid.expenses[0].occurrenceStatuses['2026-11-22'],
]);

const nearGoal = goal({ targetAmount: 62.35 });
check('P08 objectifs et plafonds', [6235, [-1231], 62.35, 6235], [
  goalSavingsOnAccountCents([nearGoal], today), goalOccurrences([{ ...nearGoal, onCurrentAccount: false }], today, end).map(x => x.amountCents),
  recordGoalContribution(nearGoal, today).savedAmount, goalSavingsOnAccountCents([{ ...nearGoal, ...recordGoalContribution(nearGoal, today) }], today),
]);
const caf = base({ spendings: [
  spending({ id: 'a', amount: 3.51 }), spending({ id: 'b', amount: 3.50, label: 'cafe', date: '2026-11-12' }),
  spending({ id: 'c', amount: 3.50, date: '2026-11-05' }), spending({ id: 'd', amount: 5, date: '2026-10-25' }),
  spending({ id: 'e', amount: 10, label: 'Frites', date: '2026-11-15' }),
] });
const coffeeLabels = labelBreakdown(caf, '2026-11', 'restaurants', '2026-11');
const tip = savingsTip(caf, today);
const parts = chartParts([{ cents: 63 }, { cents: 22 }, { cents: 15 }], x => String(x.cents), 1);
check('P09 libellés, parts et conseil sur 30 jours', [2051, 1051, 1051 / 2051, 6000, 4, 15.51, 186.12, 7.76, [63, 37], [0.63, 0.37]], [
  analyzeMonth(caf, '2026-11').totalCents, coffeeLabels.rows[0].cents, coffeeLabels.rows[0].share, coffeeLabels.rows[0].yearlyCents,
  tip?.count, tip?.total, tip?.yearly, tip?.halfPerMonth, parts.map(x => x.cents), parts.map(x => x.share),
]);

const d = debt({ occurrenceStatuses: { '2026-12-29': 'cancelled' } });
check('P10 dette avec annulation et simulation', ['2026-11-29', '2027-01-29', false, -0.01, null], [
  nextDebtOccurrence(d, today)?.dueDate, estimateDebtEndDate(d, nextDebtOccurrence(d, today), today),
  simulatePurchase(pro.availableForecast, 109.85, today)?.affordable,
  simulatePurchase(pro.availableForecast, 109.85, today)?.available,
  simulatePurchase(pro.availableForecast, 25, '2026-12-29'),
]);
check('P11 centimes et dates belges', [101, -101, -1234.56, 1234.56, 12.25, '2026-03-29', '2026-03-28', '2026-10-25', '2026-10-26', '2026-03-30', 1], [
  toCents(1.005), toCents(-1.005), fromCents(-123456), parseAmountInput('1\u202f234,56'), parseAmountInput('12.25'),
  ...['2026-03-28T23:00:00Z', '2026-03-28T22:59:59Z', '2026-10-25T01:00:00Z', '2026-10-25T23:00:00Z']
    .map(date => todayInBrussels(new Date(date))),
  addDays('2026-03-29', 1), daysBetween('2026-10-25', '2026-10-26'),
]);

const noReserve = { ...emptyBudgetState.userProfile, safetyReserve: 0 };
const transferGoal = goal({ onCurrentAccount: false, monthlyContribution: 100, savedAmount: 0 });
const before = base({ userProfile: noReserve, goals: [transferGoal] });
const after = { ...before, goals: [{ ...transferGoal, ...recordGoalContribution(transferGoal, today) }] };
check('C01 virement confirmé sur compte à part', [200, 200, 300], [summary(before).trueAvailable, summary(after).trueAvailable, after.currentBalance]);
const postedDebt = recordPayment(base({ debts: [debt({ remainingAmount: 75.30, nextDueDate: today })] }), {
  type: 'debt', id: 'dette', dueDate: today, today, balanceIncludesPayment: false,
});
check('C02 dernière mensualité dans l’analyse', [324.70, 7530], [postedDebt.currentBalance, analyzeMonth(postedDebt, '2026-11').totalCents]);
const oldCharge = recordPayment(base({ expenses: [expense({ dueDate: today, amount: 40 })] }), {
  type: 'expense', id: 'charge', dueDate: today, today, balanceIncludesPayment: false,
});
check('C03 prix historique après modification', 4000, analyzeMonth({ ...oldCharge, expenses: [{ ...oldCharge.expenses[0], amount: 60 }] }, '2026-11').totalCents);
const pastIncome = base({ balanceDate: '2026-11-20', incomes: [income({ expectedDate: '2026-11-21' })] });
check('C04 rentrée passée dans le rapprochement', ['2026-11-21'], passedOccurrences(pastIncome, today).map(x => x.dueDate));
const copied = updateBalance(base(), { amount: 370, today });
const encoded = addSpending(copied, spending({ balanceIncluded: true, amount: 30 }), today);
check('C05 dépense encodée du jour déjà dans le solde', [370, 0, 3000], [
  encoded.currentBalance, analyzeMonth(encoded, '2026-11').unrecordedCents, analyzeMonth(encoded, '2026-11').totalCents,
]);
const completed = goal({ savedAmount: 500, monthlyContribution: 90 });
const capacity = summary(base({ goals: [completed], incomes: [income({ amount: 100 })] })).savingsCapacity;
check('C06 objectif terminé ne mobilise plus de mensualité', 100, capacity);
const firstMonth = goal({ targetAmount: 20, savedAmount: 0, monthlyContribution: 20, targetDate: '2026-11-30', onCurrentAccount: false });
check('C07 mise de côté prévue avant la date cible', [1, 'realistic'], [
  goalOccurrences([firstMonth], today, firstMonth.targetDate).length, assessGoalFeasibility(firstMonth, 100, today).status,
]);
const ended = expense({ isRecurring: true, frequency: 'monthly', dueDate: '2026-09-01', endDate: '2026-10-01', amount: 80 });
check('C08 marge après fin d’une charge', [0, 100], [
  expenseOccurrences(ended, today, end).filter(isOpenOccurrence).length,
  summary(base({ incomes: [income({ amount: 100 })], expenses: [ended] })).savingsCapacity,
]);
const huge = 30_000_000_000_000.01;
check('C09 arrondi à grande valeur', 3_000_000_000_000_001, toCents(huge));
const stale = expense({ amount: 50, occurrenceAmountsCents: { '2026-11-22': 3000 } });
check('C10 valeur par occurrence dans les données', [-3000, 3000], [
  expenseOccurrences(stale, today, today)[0].amountCents,
  incomeOccurrences(income({ expectedDate: today, occurrenceAmountsCents: { [today]: 3000 } }), today, today)[0].amountCents,
]);
const onlyGoal = base({ currentBalance: 0, goals: [goal()], userProfile: noReserve });
const gSummary = summary(onlyGoal);
check('C11 seuil et escalier pour objectif seul', [-70.04, -70.04], [gSummary.trueAvailable, gSummary.availableForecast.breakdown.available]);
check('F01 présentation fr-BE', '1 234,56 €', formatCurrency(1234.56).replace(/[\u00a0\u202f]/g, ' '));
const hugeBudget = base({ currentBalance: -10_000_000_000_000 });
const unrepresentable = ['a', 'b'].reduce((state, id) => addSpending(state,
  spending({ id, amount: 10_000_000_000_000 }), today), hugeBudget);
let roundTrip;
try { roundTrip = deserializeStoredBudget(serializeBudget(unrepresentable)).budget.currentBalance; }
catch (e) { roundTrip = e.message; }
check('C12 persistance après plusieurs montants individuellement valides', -30_000_000_000_000, roundTrip);

const existing = goal({ savedAmount: 0, monthlyContribution: 60 });
const committed = summary(base({ goals: [existing], incomes: [income({ amount: 100 })] }));
check('C13 capacité restante réutilisée pour un objectif déjà déduit', [40, 'realistic'], [
  committed.savingsCapacity,
  assessGoalFeasibility(existing, committed.savingsCapacity, today).status,
]);

console.log(`Cas exécutés ${results.length}, écarts ${results.filter(x => x === 'ÉCART').length}`);
