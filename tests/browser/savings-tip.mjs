// Accueil : une seule piste d'économie, tirée des dépenses encodées.
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/savings-tip.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { formatCurrency } from '../../lib/budget-calculations.ts';
import { serializeBudget } from '../../lib/budget-state.ts';
import { savingsTip } from '../../lib/savings-tip.ts';
import { scenarios, today } from './budget-scenarios.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const clean = (text) => text.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const euro = (value) => clean(formatCurrency(value));
const spending = (id, date, amount, category, label) => ({
  id, date, amount, category, ...(label && { label }), balanceIncluded: false, debited: true, balanceRevision: 0,
});
const habit = {
  ...scenarios.depenses,
  spendings: [...scenarios.depenses.spendings,
    ...[4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 18, 19].map((day) => spending(`c${day}`, `2026-05-${String(day).padStart(2, '0')}`, 2.8, 'other', 'Café'))],
};

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

test('Une habitude ressort : la piste chiffrée s’affiche sur l’accueil', async (t) => {
  const tip = savingsTip(habit, today);
  assert.deepEqual([tip.label, tip.count, tip.total], ['Café', 12, 33.6]);
  const page = await open(t, habit);
  const text = clean(await page.getByRole('region', { name: 'Une piste d’économie' }).innerText());
  assert.ok(text.includes(`Café : ${euro(33.6)} sur les 30 derniers jours (12 fois).`), text);
  assert.ok(text.includes('À ce rythme, ≈ 403 € par an.'), text);
  assert.ok(text.includes(`En réduire la moitié te ferait garder ≈ ${euro(16.8)} par mois.`), text);
  assert.equal(await page.getByRole('link', { name: 'Voir où part mon argent' }).getAttribute('href'), '/analyse');
});

test('Aucune habitude (achats isolés, courses) : pas de conseil générique', async (t) => {
  assert.equal(savingsTip(scenarios.depenses, today), null);
  const page = await open(t, scenarios.depenses);
  assert.equal(await page.getByRole('region', { name: 'Une piste d’économie' }).count(), 0);
});
