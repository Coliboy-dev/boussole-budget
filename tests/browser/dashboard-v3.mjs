// Accueil « Aujourd'hui » (Élan V3) : chaque montant, date, statut et action affichés viennent du moteur réel.
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/dashboard-v3.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { serializeBudget } from '../../lib/budget-state.ts';
import {
  calculateBudgetSummary, formatCurrency, formatDate, formatShortDate, getUpcomingReminders, hasUndatedPayments,
} from '../../lib/budget-calculations.ts';
import { selectUpcomingPaymentReminders } from '../../lib/payment-reminders.ts';
import { scenarios, today } from './projection-scenarios.mjs';
import { GENERIC_INCOME_LABEL } from '../../lib/onboarding.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const clean = (text) => text.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const euro = (amount) => clean(formatCurrency(amount));
const status = { safe: 'Stable', fragile: 'Fragile', danger: 'Critique' };
/** « 1 déc. » termine déjà la phrase ; « 20 juin » prend un point. */
const sentence = (date) => { const text = clean(date); return text.endsWith('.') ? text : `${text}.`; };

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.BOUSSOLE_CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function open(t, state) {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  await context.clock.setFixedTime(new Date(`${today}T10:00:00+02:00`));
  await context.addInitScript(([value]) => {
    if (!localStorage.getItem('boussole-budget-v2')) {
      localStorage.setItem('boussole-budget-v2', value);
      localStorage.setItem('boussole-budget-owner-v1', JSON.stringify({ type: 'guest' }));
    }
  }, [serializeBudget(state)]);
  const page = await context.newPage();
  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Aujourd’hui', level: 1 }).waitFor();
  return page;
}

function engine(state) {
  const summary = calculateBudgetSummary(state.currentBalance, state.incomes, state.expenses, state.debts, state.childExpenses,
    state.userProfile.safetyReserve, state.goals, today, { envelopes: [], spendings: [] });
  const reminders = getUpcomingReminders(state.expenses, state.debts, [], today, summary.availableForecast.horizon);
  return { summary, reminders };
}

for (const [name, state] of Object.entries(scenarios)) {
  if (name === 'vide') continue; // budget vide : parcours d'accueil, sans tableau de bord
  test(`Aujourd'hui · ${name} · montants, dates, statut et actions du moteur`, async (t) => {
    const page = await open(t, state);
    const { summary, reminders } = engine(state);
    const forecast = summary.availableForecast;
    const body = clean(await page.locator('main').innerText());

    // Carte du vrai disponible : chiffre, définition en toutes lettres, calcul en escalier.
    const cardLocator = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Vrai disponible' }) }).first();
    let card = clean(await cardLocator.innerText());
    assert.ok(card.includes(euro(summary.trueAvailable)), `vrai disponible ${summary.trueAvailable}`);
    if (summary.emptyBudget) {
      assert.doesNotMatch(card, /Stable|Fragile|Critique/);
    } else {
      const until = clean(formatDate(forecast.dailyBalances.at(-1).date));
      assert.ok(card.includes(summary.trueAvailable < 0
        ? `Il te manque ${euro(-summary.trueAvailable)} pour couvrir tout ce qui est prévu jusqu’au ${until}.`
        : `Ce que tu peux dépenser jusqu’au ${until} en couvrant tes paiements prévus.`), `définition — « ${card} »`);
      assert.ok(card.includes(status[summary.riskLevel]), `statut ${summary.riskLevel}`);
      // Prochaine rentrée certaine : le repère de chacun, quel que soit son jour de paie.
      const next = forecast.nextIncome;
      assert.ok(card.includes(next
        ? `Prochaine rentrée : ${next.label === GENERIC_INCOME_LABEL ? '' : `${next.label}, `}${euro(next.amount)} le ${sentence(formatShortDate(next.date))}`
        : `Aucune rentrée certaine prévue d’ici le ${sentence(formatShortDate(forecast.dailyBalances.at(-1).date))}`), `rentrée — « ${card} »`);
      assert.doesNotMatch(card, /[^.]\.\.(?!\.)/, 'jamais « déc.. »');
      // L'escalier, replié par défaut sur l'accueil : chaque ligne affichée vient du moteur.
      await cardLocator.getByText('Comment c’est calculé').click();
      const steps = cardLocator.locator('dl > div');
      const lines = (await steps.allInnerTexts()).map(clean);
      const b = forecast.breakdown;
      const lowestDay = b.lowestDate === today ? 'aujourd’hui' : `le ${clean(formatShortDate(b.lowestDate))}`;
      const expected = [
        `Ton solde aujourd’hui ${euro(b.balance)}`,
        b.incomes > 0 && `Revenus certains d’ici ${lowestDay} + ${euro(b.incomes)}`,
        b.charges > 0 && `Charges et mensualités d’ici ${lowestDay} − ${euro(b.charges)}`,
        b.envelopes > 0 && `Enveloppes (dépenses du quotidien) − ${euro(b.envelopes)}`,
        b.incomes + b.charges + b.envelopes + b.savingsTransfers > 0
          && `Ce qui te reste au plus bas, ${lowestDay} ${b.lowest < 0 ? `−${euro(-b.lowest)}` : euro(b.lowest)}`,
        `Réserve de sécurité − ${euro(b.safetyReserve)}`,
        b.annualProvision > 0 && `Provisions pour charges annuelles − ${euro(b.annualProvision)}`,
        `${b.available < 0 ? 'Il te manque' : 'Tu peux dépenser'} ${euro(Math.abs(b.available))}`,
      ].filter(Boolean);
      assert.equal(lines.length, expected.length, lines.join(' | '));
      for (const [index, line] of expected.entries()) assert.ok(lines[index].startsWith(line), `« ${lines[index]} » ≠ « ${line} »`);
      assert.equal(b.available, summary.trueAvailable);
      card = clean(await cardLocator.innerText());
      // Pas de connexion bancaire : le calcul dit d'où viennent ses chiffres.
      assert.ok(card.includes(state.balanceDate ? `D’après ton solde du ${clean(formatShortDate(state.balanceDate))} et ce que tu as encodé.`
        : 'D’après ton solde et ce que tu as encodé.'), card);
      assert.ok(!card.includes('sans risque'), 'pas de promesse absolue');
    }
    assert.equal(card.includes('Projection partielle'), hasUndatedPayments(state.expenses, state.debts));
    assert.equal(body.includes('Projection à compléter'), hasUndatedPayments(state.expenses, state.debts));
    assert.ok(card.includes(euro(state.currentBalance)), 'solde bancaire');
    assert.ok(card.includes(euro(state.userProfile.safetyReserve)), 'réserve');

    // « Ajouter une dépense » : un seul bouton, au centre de la barre du bas ; plus de raccourci Réglages en haut.
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    assert.equal(await page.getByRole('button', { name: 'Ajouter une dépense' }).count(), 1);
    assert.deepEqual((await nav.locator(':scope > div > a, :scope > div > button').allInnerTexts()).map(clean), ['Aujourd’hui', 'Échéances', 'Dépense', 'Budget', 'Plus']);
    assert.equal(await page.locator('header').getByRole('link', { name: 'Réglages' }).count(), 0);
    await page.getByRole('link', { name: 'Voir les échéances' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Simuler un achat' }).count(), 1);

    // Risque : constat chiffré du moteur, renvoi vers Échéances.
    const risk = page.locator('section[aria-labelledby="home-risk-title"]');
    if (summary.riskLevel === 'safe' || summary.emptyBudget) {
      assert.equal(await risk.count(), 0);
    } else {
      const text = clean(await risk.innerText());
      assert.ok(text.includes(summary.riskLevel === 'danger' ? 'Découvert prévu' : 'Sous la réserve de sécurité'));
      assert.ok(text.includes(euro(forecast.balance)) && text.includes(clean(formatShortDate(forecast.date))));
      for (const cause of forecast.causes.slice(0, 2)) assert.ok(text.includes(cause), `cause ${cause}`);
      assert.equal(await risk.getByRole('link', { name: 'Voir le détail et quoi vérifier' }).getAttribute('href'), '/projection');
    }

    // Prochaines échéances : mêmes lignes, montants, dates et boutons « Payé ».
    const list = page.locator('section[aria-labelledby="home-upcoming-heading"]');
    if (summary.emptyBudget) {
      assert.equal(await list.count(), 0);
    } else {
      const expected = selectUpcomingPaymentReminders(reminders, today, true);
      assert.equal(await list.locator('li').count(), expected.length);
      for (const [index, { reminder, remindTomorrow }] of expected.entries()) {
        const row = clean(await list.locator('li').nth(index).innerText());
        assert.ok(row.includes(reminder.label), reminder.label);
        assert.ok(row.includes(remindTomorrow ? 'À payer demain' : clean(formatShortDate(reminder.dueDate))), `${reminder.label} date`);
        if (reminder.amount !== undefined) assert.ok(row.includes(euro(reminder.amount)), `${reminder.label} montant`);
        const payable = (reminder.type === 'expense' || reminder.type === 'debt') && Boolean(reminder.refId);
        assert.equal(await page.locator(`[id="pay-home-${reminder.id}"]`).count(), payable ? 1 : 0);
      }
      const late = reminders.filter(({ isLate }) => isLate).length;
      assert.equal(await list.getByRole('link', { name: /en retard/ }).count(), late > 0 ? 1 : 0);
    }

    // Courbe : soldes du moteur.
    const curve = page.getByRole('img', { name: /Solde prudent du/ });
    assert.ok(clean(await curve.getAttribute('aria-label')).includes(euro(forecast.balance)));
    assert.equal(await page.locator('#projection-day').getAttribute('max'), String(forecast.dailyBalances.length - 1));
  });
}

test('Aujourd\'hui · Payé puis Annuler rétablissent le solde', async (t) => {
  const { demo } = scenarios;
  const page = await open(t, demo);
  const { reminders } = engine(demo);
  const target = reminders.find((reminder) => !reminder.isLate && reminder.type === 'expense' && reminder.refId);
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Vrai disponible' }) }).first();
  const before = clean(await card.innerText());
  await page.locator(`[id="pay-home-${target.id}"]`).click();
  await page.getByRole('button', { name: 'Annuler' }).waitFor();
  assert.ok(clean(await card.innerText()).includes(euro(demo.currentBalance - target.amount)));
  await page.getByRole('button', { name: 'Annuler' }).click();
  await page.locator(`[id="pay-home-${target.id}"]`).waitFor();
  assert.equal(clean(await card.innerText()), before);
});

test('B01 · « Payé » sur une échéance due au plus tard le jour du solde recopié : question, jamais de double déduction', async (t) => {
  const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('boussole-budget-v2')).state);
  // Accueil : loyer dû aujourd'hui, solde recopié aujourd'hui (peut-être après le débit).
  const rent = { id: 'loyer', label: 'Loyer', category: 'rent', amount: 300, frequency: 'monthly', dueDate: today, isRecurring: true, isPaid: false };
  const dueToday = { ...scenarios['sans-echeance'], expenses: [rent] };
  const home = engine(dueToday).reminders.find(({ refId }) => refId === 'loyer');
  let page = await open(t, dueToday);
  await page.locator(`[id="pay-home-${home.id}"]`).click();
  let question = page.getByRole('dialog', { name: 'Déjà débité ?' });
  assert.ok(clean(await question.innerText()).includes(`Ton solde du ${clean(formatShortDate(today))} comprend-il déjà ce paiement : Loyer, ${euro(300)} ?`));
  // Fermer la question n'enregistre rien.
  await question.getByRole('button', { name: 'Fermer' }).click();
  assert.equal((await stored(page)).expenses[0].occurrenceStatuses?.[today], undefined);
  // « Oui, déjà débité » : marqué payé, solde inchangé.
  await page.locator(`[id="pay-home-${home.id}"]`).click();
  await question.getByRole('button', { name: 'Oui, déjà débité' }).click();
  await page.getByRole('button', { name: 'Annuler' }).waitFor();
  let state = await stored(page);
  assert.deepEqual([state.currentBalance, state.expenses[0].occurrenceStatuses[today]], [dueToday.currentBalance * 100, 'paid']);

  // Échéances, charge en retard : « Non, déduis-le » déduit une seule fois.
  const { retard } = scenarios;
  const late = engine(retard).reminders.find((reminder) => reminder.isLate && reminder.type === 'expense' && reminder.refId);
  assert.ok(late && retard.balanceDate >= late.dueDate, 'échéance due avant le solde recopié');
  page = await open(t, retard);
  await page.goto('/projection');
  await page.locator(`[id="pay-${late.id.replace(/^rem-/, '')}"]`).click();
  question = page.getByRole('dialog', { name: 'Déjà débité ?' });
  await question.getByRole('button', { name: 'Non, déduis-le' }).click();
  await page.getByRole('button', { name: 'Annuler' }).waitFor();
  state = await stored(page);
  assert.equal(state.currentBalance, Math.round((retard.currentBalance - late.amount) * 100), 'déduit une fois');
});

test('U01 et C11 · premier budget : « Prochaine rentrée : 1 600,00 € le 1 déc. » ; solde 0 € avec un objectif : carte et détail donnent le même total', async (t) => {
  const { emptyBudgetState } = await import('../../lib/budget-state.ts');
  const day = '2026-11-23';
  const openOn = async (state) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    t.after(() => context.close());
    await context.clock.setFixedTime(new Date(`${day}T10:00:00+01:00`));
    await context.addInitScript(([value]) => {
      localStorage.setItem('boussole-budget-v2', value);
      localStorage.setItem('boussole-budget-owner-v1', JSON.stringify({ type: 'guest' }));
    }, [serializeBudget(state)]);
    const page = await context.newPage();
    await page.goto('/dashboard');
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Vrai disponible' }) }).first();
    await card.waitFor();
    return { page, card };
  };
  const first = { ...emptyBudgetState, currentBalance: 400, balanceDate: day, incomes: [{
    id: 'initial-income', label: GENERIC_INCOME_LABEL, type: 'other', amount: 1600, frequency: 'one_time', expectedDate: '2026-12-01', isConfirmed: true,
  }] };
  let { card } = await openOn(first);
  let text = clean(await card.innerText());
  assert.ok(text.includes(`Prochaine rentrée : ${euro(1600)} le 1 déc.`), text);
  assert.ok(!text.includes(`: ${GENERIC_INCOME_LABEL}`) && !text.includes('déc..'), text);
  // Résumé « Comment c'est calculé » : cible tactile de 44 px.
  const height = await card.getByText('Comment c’est calculé').evaluate((element) => element.getBoundingClientRect().height);
  assert.ok(height >= 44, `hauteur ${height}`);

  // C11 : solde recopié de 0 €, réserve 0 €, objectif gardé sur le compte (50,04 € + 20 € ce mois-ci) → −70,04 € partout.
  const zero = { ...emptyBudgetState, currentBalance: 0, balanceDate: day, userProfile: { ...emptyBudgetState.userProfile, safetyReserve: 0 },
    goals: [{ id: 'g', label: 'Coussin', targetAmount: 500, savedAmount: 50.04, monthlyContribution: 20, onCurrentAccount: true, status: 'realistic' }] };
  ({ card } = await openOn(zero));
  await card.getByText('Comment c’est calculé').click();
  text = clean(await card.innerText());
  assert.ok(text.includes(`Il te manque ${euro(70.04)}`), text);
  assert.ok(text.includes(`−${euro(70.04)}`) || text.includes(`-${euro(70.04)}`), `carte : ${text}`);
});
