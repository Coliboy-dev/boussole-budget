// Nouvelles catégories : lues et affichées, jamais modifiées en silence, proposées à la saisie (deuxième mise en ligne).
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/categories.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { serializeBudget } from '../../lib/budget-state.ts';
import { scenarios, today } from './budget-scenarios.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const base = scenarios.depenses;
// Budget écrit par une version plus récente (autre appareil, membre du foyer) : catégories inconnues jusqu'ici.
const state = {
  ...base,
  spendings: [...base.spendings,
    { id: 'v1', date: '2026-05-20', amount: 84, category: 'travel', label: 'Hôtel Ostende', balanceIncluded: false, debited: true, balanceRevision: 0 },
    { id: 'p1', date: '2026-05-21', amount: 23.5, category: 'pets', label: 'Croquettes', balanceIncluded: false, debited: true, balanceRevision: 0 }],
  expenses: [...base.expenses,
    { id: 'tx', label: 'Précompte immobilier', category: 'taxes', amount: 480, frequency: 'annual', dueDate: '2026-09-15', isPaid: false, isRecurring: true }],
};
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('boussole-budget-v2')).state);

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.BOUSSOLE_CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function open(t, route) {
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

test('Le budget s’ouvre et les nouvelles catégories sont affichées avec leur nom', async (t) => {
  const page = await open(t, '/analyse');
  await page.getByRole('button', { name: /^Vacances et voyages/ }).waitFor();
  await page.getByRole('button', { name: /^Animaux/ }).waitFor();
  const charges = await open(t, '/charges');
  await charges.getByRole('button', { name: /Précompte immobilier/ }).click();
  await charges.getByRole('dialog').getByText('Impôts et taxes').waitFor();
});

test('Modifier une dépense « Vacances et voyages » garde sa catégorie', async (t) => {
  const page = await open(t, '/depenses');
  await page.getByRole('button', { name: /Hôtel Ostende/ }).click();
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Modifier la dépense' });
  assert.equal(await sheet.getByRole('radio', { name: 'Vacances et voyages', exact: true }).isChecked(), true);
  await sheet.locator('input[name=amount]').fill('90');
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await sheet.waitFor({ state: 'detached' });
  const hotel = (await stored(page)).spendings.find(({ id }) => id === 'v1');
  assert.deepEqual([hotel.amount, hotel.category], [9000, 'travel']);
});

test('Modifier une charge « Impôts et taxes » garde sa catégorie', async (t) => {
  const page = await open(t, '/charges');
  await page.getByRole('button', { name: /Précompte immobilier/ }).click();
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  const form = page.getByRole('dialog');
  const select = form.locator('select').first();
  assert.equal(await select.inputValue(), 'taxes');
  await form.locator('input[name=amount]').fill('500');
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  await form.waitFor({ state: 'detached' });
  const tax = (await stored(page)).expenses.find(({ id }) => id === 'tx');
  assert.deepEqual([tax.amount, tax.category], [50000, 'taxes']);
});

test('Nouvelle dépense ou charge : les nouvelles catégories sont proposées', async (t) => {
  const page = await open(t, '/budget');
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Ajouter une dépense' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nouvelle dépense' });
  await sheet.getByRole('button', { name: 'Autres catégories' }).click();
  for (const name of ['Animaux', 'Cadeaux et fêtes', 'Soins et beauté', 'Vacances et voyages', 'Loisirs, sport et sorties']) {
    await sheet.getByRole('radio', { name, exact: true }).waitFor();
  }
  // Un commerce connu suggère la bonne catégorie.
  await sheet.getByLabel('Saisie rapide').fill('12 Zooplus');
  assert.equal(await sheet.getByRole('radio', { name: 'Animaux', exact: true }).isChecked(), true);
  await sheet.getByRole('button', { name: 'Ajouter la dépense' }).click();
  await sheet.waitFor({ state: 'detached' });
  const zoo = (await stored(page)).spendings.find(({ label }) => label === 'Zooplus');
  assert.deepEqual([zoo.amount, zoo.category], [1200, 'pets']);

  const charges = await open(t, '/charges');
  await charges.getByRole('button', { name: /Ajouter/ }).first().click();
  const options = await charges.getByRole('dialog').locator('select').first().locator('option').allInnerTexts();
  for (const name of ['Contribution alimentaire', 'Impôts et taxes', 'Garde d’enfants']) assert.ok(options.includes(name), name);
  assert.ok(!options.includes('Courses alimentaires'), 'Courses reste réservé aux charges déjà encodées');
});
