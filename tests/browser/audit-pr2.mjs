import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { BUDGET_STORAGE_KEY, emptyBudgetState, serializeBudget } from '../../lib/budget-state.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const today = '2026-11-23';
const budget = { ...emptyBudgetState, currentBalance: 400, balanceDate: today };
const button = (page, name) => page.getByRole('button', { name, exact: true });
const stored = (page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, BUDGET_STORAGE_KEY);
const overdraft = (page) => page.getByRole('checkbox', { name: 'Mon compte est à découvert' });

let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.BOUSSOLE_CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

async function open(t, initial, pathname = '/dashboard') {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale: 'fr-BE', serviceWorkers: 'block' });
  t.after(() => context.close());
  await context.clock.setFixedTime(new Date(today + 'T10:00:00+01:00'));
  if (initial) {
    await context.addInitScript(([key, value]) => {
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(key, value);
      localStorage.setItem('boussole-budget-owner-v1', JSON.stringify({ type: 'guest' }));
    }, [BUDGET_STORAGE_KEY, serializeBudget(initial)]);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  await page.goto(pathname);
  return { context, page };
}

async function enterBalance(page, amount) {
  await page.getByRole('button', { name: /^(Modifier|Mettre à jour) le solde bancaire$/ }).click();
  await page.getByLabel('Solde bancaire actuel').fill(amount);
}

const success = page => page.getByText('Solde mis à jour.', { exact: true });

test('B04 · le deuxième onglet annonce le conflit et permet de reprendre le montant', async (t) => {
  const { context, page: first } = await open(t, budget);
  const second = await context.newPage();
  second.setDefaultTimeout(6000);
  await second.goto('/dashboard');
  await enterBalance(second, '380');
  await enterBalance(first, '390');
  await button(first, 'OK').click();
  await success(first).waitFor();
  await button(second, 'OK').click();
  assert.equal((await stored(second)).currentBalance, 39000);
  assert.equal(await success(second).count(), 0, 'aucun succès pour le solde de 380 € refusé');
  await second.getByRole('alert').filter({ hasText: /autre onglet/ }).waitFor();
  await button(second, 'Recharger le budget').click();
  assert.equal(await second.getByLabel('Solde bancaire actuel').inputValue(), '380');
  await button(second, 'OK').click();
  await success(second).waitFor();
  assert.equal((await stored(second)).currentBalance, 38000);
});

test('Découvert · le premier budget accepte un montant sans signe', async (t) => {
  const { page } = await open(t);
  // Avec l'inscription activée, un choix précède le premier budget ; sans elle, le formulaire s'ouvre directement.
  const start = button(page, 'Commencer mon budget');
  const balance = page.getByLabel('Solde bancaire (€)');
  await start.or(balance).first().waitFor();
  if (await start.isVisible()) await start.click();
  await balance.fill('25,30');
  await overdraft(page).check();
  await button(page, 'Continuer').click();
  await button(page, 'Pas de rentrée confirmée').click();
  await button(page, 'Calculer sans ajouter de facture').click();
  await page.getByRole('heading', { name: 'Ton premier budget' }).waitFor();
  assert.equal((await stored(page)).currentBalance, -2530);
});

test('Découvert · le solde négatif préremplit la case et le signe clavier reste accepté', async (t) => {
  const { page } = await open(t, { ...budget, currentBalance: -25.30 });
  await page.getByRole('button', { name: 'Modifier le solde bancaire', exact: true }).click();
  const input = page.getByLabel('Solde bancaire actuel');
  assert.equal(await input.inputValue(), '25,3');
  assert.equal(await overdraft(page).isChecked(), true);
  await input.fill('-33,48');
  await button(page, 'OK').click();
  await success(page).waitFor();
  assert.equal((await stored(page)).currentBalance, -3348, 'le signe moins et la case ne s’annulent pas');
  await enterBalance(page, '33,48');
  await overdraft(page).uncheck();
  await button(page, 'OK').click();
  await success(page).waitFor();
  assert.equal((await stored(page)).currentBalance, 3348);
  await enterBalance(page, '-12,05');
  await button(page, 'OK').click();
  await success(page).waitFor();
  assert.equal((await stored(page)).currentBalance, -1205, 'la saisie du signe reste possible sans cocher');
});

test('Dates · la charge garde la date encodée, la date initiale et la borne de fin', async (t) => {
  const { page } = await open(t, budget, '/charges');
  await button(page, '+ Ajouter').click();
  const dialog = page.getByRole('dialog');
  const due = dialog.getByLabel('1re échéance');
  const end = dialog.getByLabel('Fin de la récurrence');
  await due.fill('2026-12-08');
  await dialog.getByLabel('Intitulé').fill('Assurance');
  await dialog.getByLabel('Montant (€)').fill('40');
  assert.deepEqual(await due.evaluate(field => [field.value, field.defaultValue]), ['2026-12-08', '']);
  assert.equal(await end.getAttribute('min'), '2026-12-08');
  await end.fill('2026-12-07');
  await dialog.locator('button[type=submit]').click();
  await dialog.getByText('Choisis une date égale ou postérieure à la date de début.').waitFor();
  await end.fill('2027-12-08');
  await dialog.locator('button[type=submit]').click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual((await stored(page)).expenses.map(({ dueDate, endDate }) => [dueDate, endDate]), [['2026-12-08', '2027-12-08']]);
});

test('Paiement · la question reprend « Déjà passé sur ton compte ? »', async (t) => {
  const expense = {
    id: 'energie', label: 'Électricité', category: 'energy', amount: 40,
    frequency: 'one_time', dueDate: '2026-11-22', isPaid: false, isRecurring: false,
  };
  const { page } = await open(t, { ...budget, expenses: [expense] }, '/projection');
  await button(page, 'Payé — Électricité').click();
  const dialog = page.getByRole('dialog', { name: 'Déjà passé sur ton compte ?', exact: true });
  await button(dialog, 'Oui, déjà débité').click();
  assert.equal((await stored(page)).currentBalance, 40000);
});
