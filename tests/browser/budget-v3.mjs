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

for (const [name, state] of Object.entries(scenarios)) {
  test(`Budget · ${name} · répartition des charges et du mois`, async (t) => {
    const page = await open(t, state, '/budget');
    await page.getByRole('heading', { name: 'Mon budget', level: 1 }).waitFor();
    const rows = monthlyChargesByCategory(state.expenses);
    const parts = chartParts(rows, ({ category }) => category);
    if (parts.length === 0) {
      assert.equal(await page.getByRole('region', { name: 'Répartition des charges' }).count(), 0);
    } else {
      // Les libellés de catégorie viennent de l'interface : on vérifie montants et parts, dans l'ordre.
      const section = page.getByRole('region', { name: 'Répartition des charges' });
      await section.waitFor();
      const legend = section.locator('li');
      assert.equal(await legend.count(), parts.length);
      for (const [index, part] of parts.entries()) {
        const text = clean(await legend.nth(index).innerText());
        assert.ok(text.includes(euro(part.cents)) && text.includes(clean(percent.format(part.share))), `${name} : part ${index} — « ${text} »`);
      }
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
      const legend = region.locator('li');
      assert.equal(await legend.count(), parts.length);
      for (const [index, part] of parts.entries()) {
        const text = clean(await legend.nth(index).innerText());
        assert.ok(text.includes(euro(part.cents)) && text.includes(clean(percent.format(part.share))), `${name} : part ${index} — « ${text} »`);
      }
      assert.ok(clean(await region.getByRole('img').getAttribute('aria-label'))
        .includes(`Total ${euro(recorded.reduce((sum, { cents }) => sum + cents, 0))}`));
    }
    // Chaque ligne de catégorie garde son montant.
    const body = clean(await page.locator('main').innerText());
    for (const { cents } of analysis.rows) assert.ok(body.includes(euro(cents)), `${name} : ligne ${euro(cents)}`);
  });
}

