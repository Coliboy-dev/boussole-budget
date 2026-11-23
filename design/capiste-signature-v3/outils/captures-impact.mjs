// Captures avant/après d’une proposition de styles, sur le budget de démonstration du 29 mai 2026.
// Compare aussi le contenu (montants, dates, statuts, avertissements, actions) : il doit être identique.
// BOUSSOLE_TEST_URL=http://localhost:3100 node --experimental-strip-types design/capiste-signature-v3/outils/captures-impact.mjs <dossier> [fichier.css]
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { emptyBudgetState, serializeBudget } from '../../../lib/budget-state.ts';
import {
  mockChildExpenses, mockCurrentBalance, mockDebts, mockDocuments, mockExpenses, mockGoals, mockIncomes,
  mockMediationFile, mockUser,
} from '../../../lib/mock-data.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const [outDir, cssFile] = process.argv.slice(2);
const css = cssFile ? readFileSync(cssFile, 'utf8') : '';
const routes = ['/dashboard', '/projection', '/budget', '/revenus', '/charges', '/depenses', '/analyse', '/objectifs', '/plus'];
const budget = serializeBudget({
  ...emptyBudgetState, userProfile: mockUser, currentBalance: mockCurrentBalance, balanceDate: '2026-05-29',
  incomes: mockIncomes, expenses: mockExpenses, debts: mockDebts, childExpenses: mockChildExpenses,
  goals: mockGoals, mediationFile: mockMediationFile, documents: mockDocuments,
});

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const summary = {};
for (const [name, width] of [['390', 390], ['1280', 1280]]) {
  const context = await browser.newContext({ baseURL, viewport: { width, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await context.clock.setFixedTime(new Date('2026-05-29T10:00:00+02:00'));
  await context.addInitScript(([value]) => {
    if (!localStorage.getItem('boussole-budget-v2')) {
      localStorage.setItem('boussole-budget-v2', value);
      localStorage.setItem('boussole-budget-owner-v1', JSON.stringify({ type: 'guest' }));
    }
  }, [budget]);
  const page = await context.newPage();
  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    if (css) await page.addStyleTag({ content: css });
    await page.waitForTimeout(250);
    const slug = route.slice(1) || 'accueil';
    await page.screenshot({ path: `${outDir}/${slug}-${name}.png`, fullPage: true });
    // Contenu sémantique : texte affiché, rôles et noms des actions, alertes.
    summary[`${slug}-${name}`] = await page.evaluate(() => ({
      text: document.body.innerText.replace(/\s+/g, ' ').trim(),
      actions: [...document.querySelectorAll('a, button, input, select, textarea')]
        .map((el) => `${el.tagName}:${el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''}:${el.hasAttribute('disabled')}`),
      alerts: [...document.querySelectorAll('[role=alert], [role=status]')].map((el) => el.textContent?.trim()),
    }));
  }
  await context.close();
}
await browser.close();
writeFileSync(`${outDir}/contenu.json`, JSON.stringify(summary, null, 1));
console.log(`${Object.keys(summary).length} captures dans ${outDir}`);
