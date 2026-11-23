// Captures de Budget et Analyse (lot 4) pour chaque scénario, et relevé des montants affichés.
// BOUSSOLE_TEST_URL=http://localhost:3100 node --experimental-strip-types design/capiste-signature-v3/outils/captures-budget.mjs <dossier>
// Comparer deux relevés : node design/capiste-signature-v3/outils/captures-budget.mjs --comparer <avant>/montants.json <après>/montants.json
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { serializeBudget } from '../../../lib/budget-state.ts';
import { scenarios, today } from '../../../tests/browser/budget-scenarios.mjs';

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
    for (const route of ['/budget', '/analyse']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      const slug = route.slice(1);
      let text = await page.locator('main').innerText();
      await page.screenshot({ path: `${outDir}/${slug}-${name}-${width}.png`, fullPage: true });
      // Budget en deux vues (lot 4 bis) : on relève aussi la vue Charges.
      const charges = page.getByRole('group', { name: 'Vue' }).getByRole('button', { name: 'Charges' });
      if (route === '/budget' && await charges.count()) {
        await charges.click();
        await page.waitForTimeout(300);
        text += `\n${await page.locator('main').innerText()}`;
        await page.screenshot({ path: `${outDir}/${slug}-charges-${name}-${width}.png`, fullPage: true });
      }
      if (width === 390) found[`${slug}-${name}`] = amounts(text);
    }
    await context.close();
  }
}
await browser.close();
writeFileSync(`${outDir}/montants.json`, JSON.stringify(found, null, 1));
console.log(`${Object.keys(found).length} relevés dans ${outDir}`);
