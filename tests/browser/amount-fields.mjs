// Montants tapés au clavier : « 12,34 » doit valoir 12,34 €, jamais 1 234 € ni une erreur, sur chaque formulaire.
// Un champ type="number" peut avaler la virgule (Chrome, Android) : tous les montants sont des champs texte à clavier décimal.
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/amount-fields.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { serializeBudget } from '../../lib/budget-state.ts';
import { scenarios, today } from './budget-scenarios.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const base = scenarios['sans-echeance'];
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('boussole-budget-v2')).state);

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.BOUSSOLE_CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function open(t, route, state = base) {
  const context = await browser.newContext({ baseURL, locale: 'fr-BE', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
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

/** Tape vraiment au clavier, touche par touche, comme sur un téléphone. */
async function type(field, text) {
  assert.equal(await field.getAttribute('type'), 'text', 'champ texte, pas type="number"');
  assert.equal(await field.getAttribute('inputmode'), 'decimal', 'clavier décimal');
  await field.fill('');
  await field.pressSequentially(text);
  assert.equal(await field.inputValue(), text, 'la virgule reste affichée');
}

async function addWith(page, fields) {
  await page.getByRole('button', { name: '+ Ajouter', exact: true }).click();
  const form = page.getByRole('dialog');
  for (const [name, value] of Object.entries(fields)) {
    const field = form.locator(`[name="${name}"]`);
    if (typeof value === 'function') await value(form);
    else if (/amount|Amount|Payment|paidByUser|Contribution/.test(name)) await type(field, value);
    else await field.fill(value);
  }
  await form.locator('button[type=submit]').click();
  await form.waitFor({ state: 'detached' });
}

const last = (list) => list.at(-1);

test('Solde bancaire : « 12,34 » enregistre 12,34 €', async (t) => {
  const page = await open(t, '/dashboard');
  await page.getByRole('button', { name: /solde bancaire/ }).click();
  await type(page.locator('input[name=balance]'), '12,34');
  await page.getByRole('button', { name: 'OK' }).click();
  await page.getByText('Solde mis à jour.').waitFor();
  assert.equal((await stored(page)).currentBalance, 1234);
});

test('Solde bancaire : « 1 234,50 » accepté, « 12,345 » refusé avec un message', async (t) => {
  const page = await open(t, '/dashboard');
  await page.getByRole('button', { name: /solde bancaire/ }).click();
  const field = page.locator('input[name=balance]');
  await type(field, '12,345');
  await page.getByRole('button', { name: 'OK' }).click();
  await page.getByRole('alert').filter({ hasText: 'Encode un montant de solde valide.' }).waitFor();
  assert.equal((await stored(page)).currentBalance, base.currentBalance * 100, 'rien n’est enregistré');
  await type(field, '1 234,50');
  await page.getByRole('button', { name: 'OK' }).click();
  await page.getByText('Solde mis à jour.').waitFor();
  assert.equal((await stored(page)).currentBalance, 123450);
});

test('Charge, revenu, dette, objectif et frais à partager : « 12,34 » enregistre 12,34 €', async (t) => {
  let page = await open(t, '/charges');
  await addWith(page, { label: 'Assurance', amount: '12,34', dueDate: '2026-12-05' });
  assert.equal(last((await stored(page)).expenses).amount, 1234);

  page = await open(t, '/revenus');
  await addWith(page, { label: 'Prime', amount: '12,34', expectedDate: '2026-12-05' });
  assert.equal(last((await stored(page)).incomes).amount, 1234);

  page = await open(t, '/dettes');
  await addWith(page, { creditor: 'Prêt', initialAmount: '200,50', remainingAmount: '100,25', monthlyPayment: '12,34', nextDueDate: '2026-12-05' });
  const debt = last((await stored(page)).debts);
  assert.deepEqual([debt.initialAmount, debt.remainingAmount, debt.monthlyPayment], [20050, 10025, 1234]);

  page = await open(t, '/objectifs');
  await addWith(page, {
    label: 'Voyage', targetAmount: '600,50', savedAmount: '12,34', monthlyContribution: '7,5',
    place: (form) => form.getByRole('radio', { name: /Sur un compte épargne/ }).check(),
  });
  const goal = last((await stored(page)).goals);
  assert.deepEqual([goal.targetAmount, goal.savedAmount, goal.monthlyContribution], [60050, 1234, 750]);

  page = await open(t, '/enfants');
  await addWith(page, { label: 'Stage', totalAmount: '24,68', paidByUser: '24,68', shareAmount: '12,34', date: today });
  const child = last((await stored(page)).childExpenses);
  assert.deepEqual([child.totalAmount, child.paidByUser, child.shareAmount], [2468, 2468, 1234]);
});

test('Dépense rapide, enveloppe et réserve de sécurité : « 12,34 » enregistre 12,34 €', async (t) => {
  let page = await open(t, '/depenses');
  await page.getByRole('button', { name: 'Ajouter une dépense' }).click();
  let form = page.getByRole('dialog');
  await type(form.locator('input[name=amount]'), '12,34');
  await form.getByRole('radio').first().check();
  await form.locator('button[type=submit]').click();
  await form.waitFor({ state: 'detached' });
  assert.equal(last((await stored(page)).spendings).amount, 1234);

  await page.getByRole('button', { name: 'Créer une enveloppe' }).click();
  form = page.getByRole('dialog');
  await form.locator('select[name=category]').selectOption('leisure');
  await type(form.locator('input[name=amount]'), '12,34');
  await form.locator('button[type=submit]').click();
  await form.waitFor({ state: 'detached' });
  assert.equal(last((await stored(page)).envelopes).monthlyAmount, 1234);

  page = await open(t, '/reglages');
  await type(page.locator('input[name=reserve]'), '12,34');
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('boussole-budget-v2')).state.userProfile.safetyReserve === 1234);
});
