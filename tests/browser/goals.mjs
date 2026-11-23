// Objectifs réservés dans le vrai disponible, « J'ai mis de côté », et où l'argent est gardé.
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/goals.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { calculateBudgetSummary, formatCurrency } from '../../lib/budget-calculations.ts';
import { serializeBudget } from '../../lib/budget-state.ts';
import { scenarios, today } from './budget-scenarios.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const clean = (text) => text.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const euro = (value) => clean(formatCurrency(value));
const voyage = { id: 'g1', label: 'Voyage', targetAmount: 600, savedAmount: 100, monthlyContribution: 50, onCurrentAccount: false, status: 'realistic' };
const base = { ...scenarios['sans-echeance'], goals: [voyage] };
const available = (state) => calculateBudgetSummary(state.currentBalance, state.incomes, state.expenses, state.debts, state.childExpenses,
  state.userProfile.safetyReserve, state.goals, today, { envelopes: state.envelopes ?? [], spendings: state.spendings ?? [] }).trueAvailable;
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('boussole-budget-v2')).state);

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.BOUSSOLE_CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function open(t, state, route) {
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
  await page.goto(route);
  await page.locator('h1').first().waitFor();
  return page;
}
const card = (page) => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Vrai disponible' }) }).first();

test('La mise de côté du mois est retirée du vrai disponible et apparaît dans les échéances', async (t) => {
  const page = await open(t, base, '/dashboard');
  const expected = available(base);
  assert.ok(expected < available({ ...base, goals: [] }), 'le moteur retire bien la mise de côté');
  assert.ok(clean(await card(page).innerText()).includes(euro(expected)), `vrai disponible ${euro(expected)}`);
  const echeances = await open(t, base, '/projection');
  await echeances.getByText('Mise de côté : Voyage').first().waitFor();
});

test('« J’ai mis de côté » : épargne augmentée, mois marqué, vrai disponible recalculé', async (t) => {
  const page = await open(t, base, '/objectifs');
  await page.getByRole('button', { name: 'J’ai mis de côté 50,00 €' }).click();
  await page.getByText('Mis de côté ce mois-ci.').waitFor();
  const goal = (await stored(page)).goals[0];
  assert.deepEqual([goal.savedAmount, goal.lastContributionMonth], [15000, today.slice(0, 7)]);
  assert.equal(await page.getByRole('button', { name: /J’ai mis de côté/ }).count(), 0);
  await page.goto('/dashboard');
  const after = { ...base, goals: [{ ...voyage, savedAmount: 150, lastContributionMonth: today.slice(0, 7) }] };
  assert.ok(clean(await card(page).innerText()).includes(euro(available(after))));
});

test('Nouvel objectif : la question « Où gardes-tu cet argent ? » est obligatoire et réserve l’épargne sur le compte', async (t) => {
  const page = await open(t, { ...base, goals: [] }, '/objectifs');
  await page.getByRole('button', { name: '+ Ajouter', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.locator('input[name=label]').fill('Soldes de janvier');
  await form.locator('input[name=targetAmount]').fill('150');
  await form.locator('input[name=savedAmount]').fill('60');
  await form.locator('button[type=submit]').click();
  await form.getByRole('alert').filter({ hasText: 'Indique où tu gardes cet argent.' }).waitFor();
  assert.equal((await stored(page)).goals.length, 0, 'rien n’est enregistré sans réponse');
  await form.getByRole('radio', { name: /Sur mon compte courant/ }).check();
  await form.locator('button[type=submit]').click();
  await form.waitFor({ state: 'detached' });
  const goal = (await stored(page)).goals[0];
  assert.deepEqual([goal.label, goal.onCurrentAccount, goal.savedAmount], ['Soldes de janvier', true, 6000]);
  await page.goto('/dashboard');
  const text = clean(await card(page).innerText());
  assert.ok(text.includes(`et ${euro(60)} d’épargne pour tes objectifs`), text);
});
