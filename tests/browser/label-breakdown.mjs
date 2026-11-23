// « Par libellé » : ce que coûtent les petites habitudes dans une catégorie (surtout « Autre »).
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/label-breakdown.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { serializeBudget } from '../../lib/budget-state.ts';
import { formatCurrency } from '../../lib/budget-calculations.ts';
import { labelBreakdown } from '../../lib/label-breakdown.ts';
import { fromCents } from '../../lib/money.ts';
import { analyzeMonth } from '../../lib/spending-analysis.ts';
import { scenarios, today } from './budget-scenarios.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const clean = (text) => text.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const euro = (cents) => clean(formatCurrency(fromCents(cents)));
const spending = (id, date, amount, category, label) => ({
  id, date, amount, category, ...(label && { label }), balanceIncluded: false, debited: true, balanceRevision: 0,
});
const coffee = (prefix, month, days, amount, label = 'Café') => days.map((day) => spending(`${prefix}${day}`, `${month}-${String(day).padStart(2, '0')}`, amount, 'other', label));
const state = {
  ...scenarios.depenses,
  spendings: [
    ...scenarios.depenses.spendings,
    ...coffee('m', '2026-05', [4, 5, 6, 7, 8, 11, 12], 2.8), ...coffee('mw', '2026-05', [13, 14], 3.1, 'café '),
    spending('t1', '2026-05-09', 9.8, 'other', 'Tabac'), spending('t2', '2026-05-20', 9.8, 'other', 'tabac'),
    spending('b1', '2026-05-16', 4.5, 'other', 'Bonbons'), spending('x1', '2026-05-22', 6, 'other'),
    ...coffee('a', '2026-04', [6, 7, 8, 9, 10, 13, 14, 15, 16, 17], 2.8),
    ...coffee('r', '2026-03', [9, 10, 11, 12, 13], 2.8, 'cafe'),
  ],
};

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

test('Analyse · « Autre » détaillé par libellé, avec le coût sur un an', async (t) => {
  const page = await open(t, '/analyse');
  await page.getByRole('button', { name: /^Autre\b/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Autre' });
  const section = sheet.getByRole('region', { name: 'Par libellé' });
  await section.waitFor();

  const month = today.slice(0, 7);
  const { rows, categoryCents } = labelBreakdown(state, month, 'other', month);
  const total = analyzeMonth(state, month).totalCents;
  // Café regroupe « Café » et « café » ; la moyenne annuelle vient de mars et avril (mois complets).
  assert.deepEqual(rows.map(({ label, count }) => [label, count]), [['Café', 9], ['Tabac', 2], ['Sans libellé', 1], ['Bonbons', 1]]);
  assert.equal(rows[0].yearlyCents, Math.round(((10 * 280 + 5 * 280) / 2) * 12));
  const items = section.locator('li');
  assert.equal(await items.count(), rows.length);
  for (const [index, row] of rows.entries()) {
    const text = clean(await items.nth(index).innerText());
    assert.ok(text.startsWith(row.label), text);
    assert.ok(text.includes(euro(row.cents)), `${row.label} : ${euro(row.cents)} — « ${text} »`);
    assert.ok(text.includes(`${row.count} fois`), text);
    assert.ok(text.includes(`${Math.round(row.share * 100)} % de la catégorie`), text);
    assert.ok(text.includes(`${Math.round((row.cents / total) * 100)} % du mois`), text);
    if (row.yearlyCents > 0) assert.ok(text.includes(`≈ ${Math.round(row.yearlyCents / 100)} € par an à ce rythme`), text);
    else assert.ok(!text.includes('par an'), text);
  }
  assert.equal(rows.reduce((sum, { cents }) => sum + cents, 0), categoryCents);
  // Le détail daté reste affiché sous le regroupement.
  await sheet.getByRole('heading', { name: 'Détail' }).waitFor();
});

test('Saisie · les libellés déjà utilisés sont proposés, ceux de la catégorie en tête', async (t) => {
  const page = await open(t, '/budget');
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Ajouter une dépense' }).click();
  const input = page.locator('input[name=label]');
  const listId = await input.getAttribute('list');
  const values = () => page.locator(`datalist[id="${listId}"] option`).evaluateAll((nodes) => nodes.map((node) => node.value));
  assert.ok((await values()).includes('Café'));
  await page.getByRole('radio', { name: 'Courses', exact: true }).check();
  assert.equal((await values())[0], 'Supermarché');
});
