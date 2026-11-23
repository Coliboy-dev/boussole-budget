// Captures de l’écran Échéances pour chaque scénario et chaque horizon, et relevé des montants affichés.
// BOUSSOLE_TEST_URL=http://localhost:3100 node --experimental-strip-types design/capiste-signature-v3/outils/captures-echeances.mjs <dossier>
// Comparer deux relevés : node design/capiste-signature-v3/outils/captures-echeances.mjs --comparer <avant>/montants.json <après>/montants.json
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { serializeBudget } from '../../../lib/budget-state.ts';
import { scenarios, today } from '../../../tests/browser/projection-scenarios.mjs';

const clean = (text) => text.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
// Montants signés : « -650,00 € » avant doit rester « -650,00 € » après.
const amounts = (text) => [...new Set([...clean(text).matchAll(/[-+]?\d{1,3}(?: \d{3})*,\d{2} €/g)].map(([value]) => value))].sort();

if (process.argv[2] === '--comparer') {
  const [before, after] = process.argv.slice(3).map((file) => JSON.parse(readFileSync(file, 'utf8')));
  let missing = 0;
  for (const [key, values] of Object.entries(before)) {
    const absent = values.filter((value) => !after[key]?.includes(value));
    if (absent.length) { missing++; console.log(`${key} : absents après → ${absent.join(' | ')}`); }
  }
  console.log(missing ? `${missing} écrans perdent des montants` : `Aucun montant perdu sur ${Object.keys(before).length} écrans.`);
  process.exit(missing ? 1 : 0);
}

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const [outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const found = {};
for (const [name, state] of Object.entries(scenarios)) {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await context.clock.setFixedTime(new Date(`${today}T10:00:00+02:00`));
    await context.addInitScript(([value]) => {
      if (!localStorage.getItem('boussole-budget-v2')) {
        localStorage.setItem('boussole-budget-v2', value);
        localStorage.setItem('boussole-budget-owner-v1', JSON.stringify({ type: 'guest' }));
      }
    }, [serializeBudget(state)]);
    const page = await context.newPage();
    await page.goto('/projection');
    await page.waitForLoadState('networkidle');
    for (const horizon of [7, 15, 30, 35]) {
      await page.getByRole('button', { name: `${horizon} jours`, exact: true }).click();
      await page.waitForTimeout(150);
      if (width === 390) found[`${name}-${horizon}`] = amounts(await page.locator('body').innerText());
      if (horizon === 35 || (name === 'demo' && width === 390)) {
        await page.screenshot({ path: `${outDir}/${name}-${horizon}j-${width}.png`, fullPage: true });
      }
    }
    await context.close();
  }
}
await browser.close();
writeFileSync(`${outDir}/montants.json`, JSON.stringify(found, null, 1));
console.log(`${Object.keys(found).length} relevés dans ${outDir}`);
