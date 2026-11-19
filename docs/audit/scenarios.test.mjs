// Boussole — 16 scénarios d'audit du moteur financier (novembre 2026).
// Diagnostic : chaque scénario affiche [attendu] et [obtenu] avec le code actuel ; aucun ne fait échouer la suite.
// À transformer en assertions strictes au chantier P0-1 (voir README.md).
// Lancer depuis la racine du dépôt :
//   TZ=Europe/Brussels node --test --experimental-strip-types docs/audit/scenarios.test.mjs
import { test, mock } from 'node:test';

const LIB = new URL('../../lib', import.meta.url).href;
const calc = await import(`${LIB}/budget-calculations.ts`);
const proj = await import(`${LIB}/projection.ts`);
const adv = await import(`${LIB}/advice-engine.ts`);
const data = await import(`${LIB}/mock-data.ts`).catch(() => null);

const log = (k, v) => console.log(`  [${k}]`, JSON.stringify(v));

function at(iso) { mock.timers.enable({ apis: ['Date'], now: new Date(iso) }); }
function reset() { mock.timers.reset(); }

const inc = (o) => ({ id: 'i' + Math.random(), label: 'rev', type: 'salary', frequency: 'monthly', isConfirmed: true, ...o });
const exp = (o) => ({ id: 'e' + Math.random(), label: 'chg', category: 'other', frequency: 'monthly', isPaid: false, isRecurring: true, ...o });
const debt = (o) => ({ id: 'd' + Math.random(), creditor: 'X', type: 'personal', initialAmount: 1000, remainingAmount: 1000, monthlyPayment: 0, status: 'to_pay', isMediationIncluded: false, ...o });
const child = (o) => ({ id: 'c' + Math.random(), label: 'frais', category: 'other', totalAmount: 0, paidByUser: 0, shareAmount: 0, status: 'pending', date: '2026-01-01', receiptSent: false, ...o });

test('S0 — budget vide : nouvel utilisateur sans aucune donnée', () => {
  const s = calc.calculateBudgetSummary(0, [], [], [], [], 50);
  log('S0', { trueAvailable: s.trueAvailable, risk: s.riskLevel, riskScore: s.riskScore });
  const s2 = calc.calculateBudgetSummary(50, [], [], [], [], 50);
  log('S0b_solde50', { trueAvailable: s2.trueAvailable, risk: s2.riskLevel, riskScore: s2.riskScore });
});

test('S1 — salaire déjà reçu (double comptage du revenu)', () => {
  // Le 10 du mois. Salaire 2000 reçu le 5 → déjà dans le solde (2100). Loyer 800 déjà payé. Reste : courses 400.
  // Attendu (vrai disponible jusqu'au prochain salaire) : 2100 − 400 − 50 = 1650
  const s = calc.calculateBudgetSummary(2100,
    [inc({ amount: 2000 })],
    [exp({ amount: 800, isPaid: true, label: 'Loyer' }), exp({ amount: 400, label: 'Courses' })],
    [], [], 50);
  log('S1', { attendu: 1650, obtenu: s.trueAvailable, ecart: s.trueAvailable - 1650 });
});

test('S2 — charge marquée payée : aucun effet', () => {
  const base = [inc({ amount: 1500 })];
  const a = calc.calculateBudgetSummary(500, base, [exp({ amount: 650, isPaid: false })], [], [], 50);
  // l'utilisateur paie le loyer, met à jour son solde (500−650 impossible ; prenons solde 1000 → 350) et coche "payé"
  const before = calc.calculateBudgetSummary(1000, base, [exp({ amount: 650, isPaid: false })], [], [], 50);
  const after = calc.calculateBudgetSummary(350, base, [exp({ amount: 650, isPaid: true })], [], [], 50);
  log('S2', { avant_paiement: before.trueAvailable, apres_paiement_et_maj_solde: after.trueAvailable, attendu_apres: before.trueAvailable, perte_fictive: before.trueAvailable - after.trueAvailable, isPaidSeul: a.trueAvailable });
});

test('S3 — revenu incertain compté à 100 %', () => {
  const s = calc.calculateBudgetSummary(100,
    [inc({ amount: 1150 }), inc({ amount: 200, isConfirmed: false, type: 'alimony' })],
    [exp({ amount: 1100 })], [], [], 50);
  log('S3', { obtenu: s.trueAvailable, prudent_sans_incertain: 100 + 1150 - 1100 - 50, risk: s.riskLevel });
});

test('S4 — dépense ponctuelle ignorée partout', () => {
  at('2026-05-29T10:00:00+02:00');
  const e = [exp({ amount: 500, frequency: 'one_time', isRecurring: false, dueDate: '2026-06-05', label: 'Réparation voiture' })];
  const s = calc.calculateBudgetSummary(600, [], e, [], [], 50);
  const p = proj.buildProjection(600, [], e, [], [], 50);
  const r = calc.getUpcomingReminders(e, [], []);
  log('S4', { trueAvailable: s.trueAvailable, attendu: 50, projection_J30: p.milestones[3].balance, attendu_J30: 100, nb_events: p.events.length, rappels: r.length });
  reset();
});

test('S5 — frais enfants : historique soustrait comme charge mensuelle, remboursements ignorés', () => {
  // 12 mois d'historique à 100 €/mois déjà payés (donc déjà sortis du solde), dont 50 % remboursés par l'ex.
  const hist = Array.from({ length: 12 }, (_, m) => child({ totalAmount: 100, paidByUser: 100, shareAmount: 50, status: 'reimbursed', date: `2025-${String(m + 1).padStart(2, '0')}-10` }));
  const s = calc.calculateBudgetSummary(1000, [inc({ amount: 1500 })], [exp({ amount: 1000 })], [], hist, 50);
  log('S5', { obtenu: s.trueAvailable, attendu_sans_historique: 1000 + 1500 - 1000 - 50, penalite_fictive: 1200, risk: s.riskLevel });
});

test('S6 — capacité d\'épargne et conseil d\'épargne', () => {
  // Données de démo : marge mensuelle réelle = 1630 − 1277 − 230 = 123 (ou −77 sans la pension incertaine)
  if (!data) return;
  const s = calc.calculateBudgetSummary(data.mockCurrentBalance, data.mockIncomes, data.mockExpenses, data.mockDebts, data.mockChildExpenses, 50);
  at('2026-05-29T10:00:00+02:00');
  const a = adv.generateAdvice(s, data.mockDebts, data.mockMediationFile);
  reset();
  const sav = a.find((x) => x.id === 'adv-savings');
  log('S6', { trueAvailable_demo: s.trueAvailable, risk: s.riskLevel, savingsCapacity: s.savingsCapacity, marge_mensuelle_reelle: 1630 - 1277 - 230, marge_sans_pension: 1430 - 1277 - 230, conseil: sav?.message, conseils: a.map((x) => x.id) });
});

test('S7 — conseils codés en dur', () => {
  const s = calc.calculateBudgetSummary(5000, [inc({ amount: 3000 })], [exp({ amount: 1000 })], [], [], 500);
  const a = adv.generateAdvice(s, [], null);
  log('S7', a.map((x) => ({ id: x.id, msg: x.message.slice(0, 70) })));
  const s2 = calc.calculateBudgetSummary(1000, [inc({ amount: 3000 })], [exp({ amount: 1000 })], [], [], 500);
  log('S7b_reserve500_solde1000', adv.generateAdvice(s2, [], null).filter((x) => x.id === 'adv-reserve').map((x) => x.message));
});

test('S8 — projection : fuseau Europe/Brussels (décalage d\'un jour)', () => {
  at('2026-05-29T10:00:00+02:00');
  const p = proj.buildProjection(1000, [], [
    exp({ amount: 100, dueDate: '2026-05-29', label: 'J0' }),
    exp({ amount: 200, dueDate: '2026-06-05', label: 'J7' }),
    exp({ amount: 300, dueDate: '2026-06-28', label: 'J30' }),
  ], [], [], 50);
  log('S8', {
    TZ: process.env.TZ, jalons: p.milestones.map((m) => [m.label, m.date, m.balance]),
    attendu: [['J0', '2026-05-29', 900], ['J7', '2026-06-05', 700], ['J15', '2026-06-13', 700], ['J30', '2026-06-28', 400]],
    events: p.events.map((e) => [e.date, e.amount]),
  });
  reset();
});

test('S9 — projection : fréquences ignorées (hebdo, sans date)', () => {
  at('2026-05-29T10:00:00+02:00');
  // Revenu hebdo 300 (≈ 4 versements en 30 j), courses hebdo 100 sans date (≈ 4 fois)
  const p = proj.buildProjection(0, [inc({ amount: 300, frequency: 'weekly', expectedDate: '2026-06-01' })], [exp({ amount: 100, frequency: 'weekly' })], [], [], 50);
  log('S9', { events: p.events.map((e) => [e.date, e.amount, e.isEstimated]), J30: p.milestones[3].balance, attendu_approx_J30: 4 * 300 - 4 * 100 });
  reset();
});

test('S10 — dates qui ne se renouvellent pas : données de démo vues aujourd\'hui (2026-11-17)', () => {
  if (!data) return;
  at('2026-11-17T10:00:00+01:00');
  const p = proj.buildProjection(data.mockCurrentBalance, data.mockIncomes, data.mockExpenses, data.mockDebts, data.mockChildExpenses, 50);
  const r = calc.getUpcomingReminders(data.mockExpenses, data.mockDebts, data.mockMediationFile.steps);
  log('S10', { nb_events: p.events.length, events: p.events.map((e) => [e.date, e.label, e.amount]), jalons: p.milestones.map((m) => m.balance), rappels: r.length });
  reset();
});

test('S11 — échéance du jour absente des rappels ; charge payée encore rappelée', () => {
  at('2026-05-29T10:00:00+02:00');
  const r = calc.getUpcomingReminders([
    exp({ amount: 100, dueDate: '2026-05-29', label: 'due aujourd\'hui' }),
    exp({ amount: 100, dueDate: '2026-06-02', label: 'payée', isPaid: true }),
    exp({ amount: 100, dueDate: '2026-05-20', label: 'en retard non payée' }),
  ], [], []);
  log('S11', r.map((x) => x.label));
  reset();
});

test('S12 — dette : mensualité en retard / arriérés / solde restant', () => {
  at('2026-05-29T10:00:00+02:00');
  const d = [debt({ status: 'late', monthlyPayment: 0, remainingAmount: 900, nextDueDate: '2026-05-10' }), debt({ status: 'to_pay', monthlyPayment: 100, remainingAmount: 40, nextDueDate: '2026-06-10' })];
  const s = calc.calculateBudgetSummary(500, [], [], d, [], 50);
  const p = proj.buildProjection(500, [], [], d, [], 50);
  log('S12', { totalMonthlyDebts: s.totalMonthlyDebts, note: 'mensualité 100 comptée alors que solde restant = 40 ; retard 900 ignoré', events: p.events.map((e) => [e.label, e.amount]) });
  reset();
});

test('S13 — arrondis flottants et fréquences', () => {
  const t = calc.calculateTotalMonthlyExpenses([exp({ amount: 0.1 }), exp({ amount: 0.2 })]);
  const w = calc.toMonthlyAmount(100, 'weekly');
  const s = calc.calculateBudgetSummary(0.3, [], [exp({ amount: 0.1 }), exp({ amount: 0.2 })], [], [], 0);
  log('S13', { '0.1+0.2': t, hebdo100: w, exact_52_12: 100 * 52 / 12, trueAvailable_devrait_etre_0: s.trueAvailable, risk: s.riskLevel, annual: calc.toMonthlyAmount(1000, 'annual') });
});

test('S14 — objectifs : contributions non déduites, faisabilité non calculée', () => {
  const goals = [{ id: 'g', label: 'x', targetAmount: 1000, savedAmount: 0, monthlyContribution: 400, status: 'realistic' }];
  const s = calc.calculateBudgetSummary(0, [inc({ amount: 1500 })], [exp({ amount: 1300 })], [], [], 50);
  log('S14', { marge: 200, contribution_objectif: 400, trueAvailable: s.trueAvailable, savingsCapacity_summary: s.savingsCapacity, fonction_morte_capacity: calc.calculateSavingsCapacity(s.trueAvailable, goals), fonction_morte_feasibility: calc.calculateGoalFeasibility(goals[0], 150) });
});

test('S15 — niveau de risque incohérent entre tableau de bord et projection', () => {
  if (!data) return;
  at('2026-05-29T10:00:00+02:00');
  const s = calc.calculateBudgetSummary(data.mockCurrentBalance, data.mockIncomes, data.mockExpenses, data.mockDebts, data.mockChildExpenses, 50);
  const p = proj.buildProjection(data.mockCurrentBalance, data.mockIncomes, data.mockExpenses, data.mockDebts, data.mockChildExpenses, 50);
  log('S15', { dashboard: [s.trueAvailable, s.riskLevel], jalons: p.milestones.map((m) => [m.label, m.date, m.balance, m.riskLevel]), plusBas: [p.lowestBalance, p.lowestDate], safetyWarning: p.safetyWarning, events: p.events.map((e) => [e.date, e.label, e.amount, e.isEstimated]) });
  reset();
});
