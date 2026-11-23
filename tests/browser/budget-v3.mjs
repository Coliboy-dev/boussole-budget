// Budget et Analyse (Élan V3, lot 4) : les montants affichés viennent du moteur réel.
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/budget-v3.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { serializeBudget } from '../../lib/budget-state.ts';
import {
  calculateBudgetSummary, calculateTotalMonthlyIncome, formatCurrency, monthlyChargesByCategory,
} from '../../lib/budget-calculations.ts';
import { chartParts } from '../../lib/chart-parts.ts';
import { fromCents, toCents } from '../../lib/money.ts';
import { analyzeMonth } from '../../lib/spending-analysis.ts';
import { scenarios, today } from './budget-scenarios.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const clean = (text) => text.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const euro = (cents) => clean(formatCurrency(fromCents(cents)));
const percent = new Intl.NumberFormat('fr-BE', { style: 'percent', maximumFractionDigits: 0 });

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

const palette = ['rgb(0, 137, 123)', 'rgb(230, 149, 0)', 'rgb(91, 79, 214)', 'rgb(224, 69, 123)'];
const otherGray = 'rgb(170, 178, 187)';

/** Légende : montant et part de chaque tranche, dans l'ordre ; couleurs distinctes dans l'ordre fixe, « Autres » en gris. */
async function checkLegend(region, parts, name) {
  const legend = region.locator('li');
  assert.equal(await legend.count(), parts.length);
  for (const [index, part] of parts.entries()) {
    const text = clean(await legend.nth(index).innerText());
    assert.ok(text.includes(euro(part.cents)) && text.includes(clean(percent.format(part.share))), `${name} : part ${index} — « ${text} »`);
    const color = await legend.nth(index).locator('[aria-hidden="true"]').first().evaluate((dot) => getComputedStyle(dot).backgroundColor);
    assert.equal(color, part.other ? otherGray : palette[index], `${name} : couleur de la part ${index}`);
  }
}

for (const [name, state] of Object.entries(scenarios)) {
  test(`Budget · ${name} · vue Dépenses du mois par défaut, puis Charges`, async (t) => {
    const page = await open(t, state, '/budget');
    await page.getByRole('heading', { name: 'Mon budget', level: 1 }).waitFor();
    const views = page.getByRole('group', { name: 'Vue' });
    assert.equal(await views.getByRole('button', { name: 'Dépenses du mois' }).getAttribute('aria-pressed'), 'true');

    // Vue par défaut : où part l'argent ce mois-ci (mêmes parts que l'Analyse), quatre couleurs distinctes puis gris.
    const analysis = analyzeMonth({ ...state, spendings: state.spendings ?? [], envelopes: state.envelopes ?? [] }, today.slice(0, 7));
    const recorded = analysis.rows.filter(({ category }) => category !== 'unrecorded');
    const spendingParts = chartParts(recorded, ({ category }) => category);
    const spendingRegion = page.getByRole('region', { name: 'Répartition des dépenses enregistrées' });
    await spendingRegion.waitFor();
    assert.equal(await page.getByRole('region', { name: 'Répartition des charges' }).count(), 0);
    await checkLegend(spendingRegion, spendingParts, name);
    if (spendingParts.length > 0) {
      assert.ok(clean(await spendingRegion.getByRole('img').getAttribute('aria-label'))
        .includes(`Total ${euro(recorded.reduce((sum, { cents }) => sum + cents, 0))}`));
    }

    // Vue Charges.
    await views.getByRole('button', { name: 'Charges' }).click();
    assert.equal(await views.getByRole('button', { name: 'Charges' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await spendingRegion.count(), 0);
    const rows = monthlyChargesByCategory(state.expenses);
    const parts = chartParts(rows, ({ category }) => category);
    const section = page.getByRole('region', { name: 'Répartition des charges' });
    await section.waitFor();
    await checkLegend(section, parts, name);
    if (parts.length > 0) {
      const summary = calculateBudgetSummary(state.currentBalance, state.incomes, state.expenses, state.debts, state.childExpenses,
        state.userProfile.safetyReserve, state.goals, today, { envelopes: state.envelopes ?? [], spendings: state.spendings ?? [] });
      assert.equal(rows.reduce((sum, { cents }) => sum + cents, 0), toCents(summary.totalMonthlyExpenses));
      assert.ok(clean(await section.getByRole('img').getAttribute('aria-label')).includes(`Total ${euro(toCents(summary.totalMonthlyExpenses))}`));

      // Répartition du mois : mêmes montants qu'avant la refonte.
      const month = clean(await page.getByRole('region', { name: 'Répartition du mois' }).innerText());
      const certain = toCents(calculateTotalMonthlyIncome(state.incomes.filter((income) => income.isConfirmed)));
      const charges = toCents(summary.totalMonthlyExpenses);
      const debts = toCents(summary.totalMonthlyDebts);
      const envelopes = toCents(summary.totalMonthlyEnvelopes);
      for (const cents of [certain, charges, debts, envelopes]) assert.ok(month.includes(euro(cents)), `${name} : ${euro(cents)}`);
      const rest = certain - charges - debts - envelopes;
      assert.ok(month.includes(rest >= 0 ? euro(rest) : euro(-rest)), `${name} : reste ${euro(rest)}`);
    }
  });

  test(`Analyse · ${name} · total du mois et dépenses enregistrées`, async (t) => {
    const page = await open(t, state, '/analyse');
    await page.getByRole('heading', { name: 'Où part mon argent', level: 1 }).waitFor();
    const analysis = analyzeMonth({ ...state, spendings: state.spendings ?? [], envelopes: state.envelopes ?? [] }, today.slice(0, 7));
    assert.ok(clean(await page.getByRole('region', { name: 'Total du mois' }).innerText()).includes(euro(analysis.totalCents)));
    const recorded = analysis.rows.filter(({ category }) => category !== 'unrecorded');
    const parts = chartParts(recorded, ({ category }) => category);
    const region = page.getByRole('region', { name: 'Répartition des dépenses enregistrées' });
    if (parts.length === 0) {
      assert.equal(await region.count(), 0);
    } else {
      await checkLegend(region, parts, name);
      assert.ok(clean(await region.getByRole('img').getAttribute('aria-label'))
        .includes(`Total ${euro(recorded.reduce((sum, { cents }) => sum + cents, 0))}`));
    }
    // Chaque ligne de catégorie garde son montant.
    const body = clean(await page.locator('main').innerText());
    for (const { cents } of analysis.rows) assert.ok(body.includes(euro(cents)), `${name} : ligne ${euro(cents)}`);
  });
}


const storedSpendings = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('boussole-budget-v2')).state.spendings ?? []);

test('Barre du bas · « Dépense » ajoute un achat depuis n’importe quel écran et le cercle se met à jour', async (t) => {
  const state = scenarios.depenses;
  const page = await open(t, state, '/budget');
  const region = page.getByRole('region', { name: 'Répartition des dépenses enregistrées' });
  const before = analyzeMonth(state, today.slice(0, 7)).rows.filter(({ category }) => category !== 'unrecorded')
    .reduce((sum, { cents }) => sum + cents, 0);
  assert.ok(clean(await region.getByRole('img').getAttribute('aria-label')).includes(`Total ${euro(before)}`));

  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Ajouter une dépense' }).click();
  await page.locator('input[name=amount]').fill('12.40');
  await page.getByRole('radio', { name: 'Restaurants et snacks', exact: true }).check();
  await page.getByRole('button', { name: 'Ajouter la dépense' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });

  const added = (await storedSpendings(page)).filter(({ amount }) => amount === 1240);
  assert.equal(added.length, 1);
  assert.equal(added[0].category, 'restaurants');
  await page.waitForFunction(([label]) => document.querySelector('[aria-label^="Où part mon argent"]')?.getAttribute('aria-label')?.replace(/[  ]/g, ' ').includes(label),
    [`Total ${euro(before + 1240)}`]);
});

test('Frais à partager · le suivi ne retire rien, la dépense est proposée et préremplie', async (t) => {
  const state = scenarios['sans-echeance'];
  const page = await open(t, state, '/enfants');
  await page.getByRole('heading', { name: 'Frais à partager', level: 1 }).waitFor();
  await page.getByRole('button', { name: '+ Ajouter', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Description').fill('Stage de foot');
  await form.getByLabel('Montant total (€)').fill('120');
  await form.getByLabel('Payé par toi (€)').fill('120');
  await form.getByLabel('Part à partager (€)').fill('60');
  await form.locator('input[name=date]').fill(today);
  await form.locator('button[type=submit]').click();
  await form.waitFor({ state: 'detached' });
  assert.equal((await storedSpendings(page)).length, (state.spendings ?? []).length, 'aucune dépense créée sans accord');

  await page.getByRole('button', { name: 'Ajouter aussi comme dépense' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nouvelle dépense' });
  assert.equal(await sheet.locator('input[name=amount]').inputValue(), '120');
  assert.equal(await sheet.getByRole('radio', { name: 'Enfants (quotidien)', exact: true }).isChecked(), true);
  await sheet.getByRole('button', { name: 'Ajouter la dépense' }).click();
  await page.getByText('Dépense ajoutée à tes dépenses du mois.').waitFor();
  const spendings = await storedSpendings(page);
  assert.deepEqual(spendings.filter(({ category }) => category === 'children').map(({ amount, label, date }) => [amount, label, date]),
    [[12000, 'Stage de foot', today]]);
});
