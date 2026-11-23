// Écran Échéances (Élan V3) : chaque montant, date, statut et action affichés viennent du moteur réel.
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/projection-v3.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { serializeBudget } from '../../lib/budget-state.ts';
import { formatCurrency, formatShortDate } from '../../lib/budget-calculations.ts';
import { AVAILABLE_HORIZON, buildProjection } from '../../lib/projection.ts';
import { scenarios, today } from './projection-scenarios.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const horizons = [7, 15, 30, AVAILABLE_HORIZON];
const { demo } = scenarios;

const clean = (text) => text.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const euro = (amount) => clean(formatCurrency(amount));

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
  await page.goto('/projection');
  await page.getByRole('heading', { name: 'Échéances', level: 1 }).waitFor();
  return page;
}

function engine(state, horizon) {
  return buildProjection(state.currentBalance, state.incomes, state.expenses, state.debts, state.childExpenses,
    state.userProfile.safetyReserve, { today, horizon, envelopes: [], spendings: [] });
}

for (const [name, state] of Object.entries(scenarios)) {
  test(`Échéances · ${name} · montants, dates, statuts et actions du moteur`, async (t) => {
    const page = await open(t, state);
    const empty = name === 'vide';
    for (const horizon of horizons) {
      await page.getByRole('button', { name: `${horizon} jours`, exact: true }).click();
      assert.equal(await page.getByRole('button', { name: `${horizon} jours`, exact: true }).getAttribute('aria-pressed'), 'true');
      const projection = engine(state, horizon);

      // Liste : une ligne par occurrence, avec son montant, sa date et « Payé » seulement pour les charges et dettes.
      const late = page.locator('#en-retard');
      const upcoming = page.locator('section[aria-labelledby="upcoming-heading"]');
      assert.equal(await page.locator('#en-retard li').count(), projection.events.filter((event) => event.isLate).length);
      assert.equal(await upcoming.locator('li').count(), projection.events.filter((event) => !event.isLate).length);
      assert.match(clean(await upcoming.innerText()), new RegExp(`${projection.events.filter((event) => !event.isLate).length} sur ${horizon} jours`));
      for (const event of projection.events) {
        const day = event.isLate && event.dueDate === today ? 'Date non renseignée'
          : event.dueDate === today ? 'Aujourd’hui' : clean(formatShortDate(event.dueDate));
        const rows = [];
        for (const item of await (event.isLate ? late : upcoming).locator('li').all()) {
          const text = clean(await item.innerText());
          if (text.includes(event.label) && text.includes(euro(Math.abs(event.amount))) && text.includes(day)) rows.push(text);
        }
        assert.ok(rows.length >= 1, `${name} ${horizon} j : ${event.label} ${event.amount} le ${day}`);
        const text = rows[0];
        assert.equal(text.includes('Montant incertain'), event.isEstimated);
        const payable = event.amount < 0 && (event.type === 'expense' || event.type === 'debt');
        assert.equal(await page.locator(`[id="pay-${event.id}"]`).count(), payable ? 1 : 0, `Payé : ${event.id}`);
      }

      if (empty) {
        assert.equal(await page.locator('section[aria-labelledby="projected-heading"]').count(), 0);
        assert.match(clean(await page.locator('main, body').first().innerText()), /Budget à compléter/);
        assert.doesNotMatch(clean(await page.locator('body').innerText()), /Stable/);
        continue;
      }

      // Solde projeté, statut écrit, courbe et alerte.
      const projected = clean(await page.locator('section[aria-labelledby="projected-heading"]').innerText());
      const end = projection.milestones.at(-1);
      const status = { safe: 'Stable', fragile: 'Fragile', danger: 'Critique' };
      assert.ok(projected.includes(`Solde prudent dans ${horizon} jours`));
      assert.ok(projected.includes(euro(end.balance)), `${name} ${horizon} j : solde final ${end.balance}`);
      assert.ok(projected.includes(status[end.riskLevel]));
      assert.ok(projected.includes(euro(projection.lowestBalance)), 'point bas');
      assert.ok(projected.includes(clean(formatShortDate(projection.lowestDate))), 'date du point bas');
      assert.ok(projected.includes(euro(projection.reservedAmount)), 'réserve');
      const curve = page.getByRole('img', { name: /Solde prudent du/ });
      assert.ok(clean(await curve.getAttribute('aria-label')).includes(euro(projection.lowestBalance)));
      assert.equal(await page.locator('#projection-day').getAttribute('max'), String(horizon));
      assert.equal(await page.locator('#projection-day').inputValue(), String(projection.dailyBalances.findIndex(({ date }) => date === projection.lowestDate)));
      if (projection.lowestRisk === 'safe') {
        assert.equal(projection.safetyWarning, false);
        assert.ok(projected.includes(`Disponible prudent sur ${horizon} jours : ${euro(projection.available)}`));
      } else {
        assert.equal(projection.safetyWarning, true);
        assert.ok(projected.includes(projection.lowestRisk === 'danger' ? 'Solde négatif prévu' : 'Solde sous ta réserve'));
        assert.ok(projected.includes(euro(projection.reservedAmount - projection.lowestBalance)), 'montant manquant pour la réserve');
        if (projection.lowestRisk === 'danger') assert.ok(projected.includes(euro(-projection.lowestBalance)), 'montant manquant pour zéro');
        for (const cause of projection.lowestCauses.slice(0, 3)) assert.ok(projected.includes(cause), `cause ${cause}`);
        if (projection.optimisticLowestBalance > projection.lowestBalance) assert.ok(projected.includes(euro(projection.optimisticLowestBalance)));
      }

      // Curseur : chaque jour affiche le solde du moteur.
      for (const index of [0, Math.floor(horizon / 2), horizon]) {
        await page.locator('#projection-day').fill(String(index));
        const point = projection.dailyBalances[index];
        assert.ok(clean(await page.locator('#projection-day').getAttribute('aria-valuetext')).endsWith(euro(point.balance)), `jour ${index}`);
      }

      // Étapes.
      const steps = page.locator('section[aria-labelledby="detail-heading"] ol li');
      assert.equal(await steps.count(), projection.milestones.length);
      for (const [index, milestone] of projection.milestones.entries()) {
        const text = clean(await steps.nth(index).innerText());
        assert.ok(text.includes(milestone.label) && text.includes(euro(milestone.balance)) && text.includes(status[milestone.riskLevel]),
          `${name} ${horizon} j : étape ${milestone.label}`);
      }
    }
  });
}

test('Échéances · Payé puis Annuler rétablissent solde, liste et projection', async (t) => {
  const page = await open(t, demo);
  const balance = page.locator('dl dd').first();
  const before = clean(await balance.innerText());
  const loyer = engine(demo, AVAILABLE_HORIZON).events.find((event) => event.label === 'Loyer');
  const end = clean(await page.locator('section[aria-labelledby="projected-heading"]').innerText());

  await page.locator(`[id="pay-${loyer.id}"]`).click();
  await page.getByRole('button', { name: 'Annuler' }).waitFor();
  assert.equal(clean(await balance.innerText()), euro(demo.currentBalance - 650));
  assert.equal(await page.locator(`[id="pay-${loyer.id}"]`).count(), 0);

  await page.getByRole('button', { name: 'Annuler' }).click();
  await page.locator(`[id="pay-${loyer.id}"]`).waitFor();
  assert.equal(clean(await balance.innerText()), before);
  assert.equal(clean(await page.locator('section[aria-labelledby="projected-heading"]').innerText()), end);
  assert.equal(await page.evaluate(() => document.activeElement?.id), `pay-${loyer.id}`);
});
