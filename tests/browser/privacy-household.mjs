// Foyer 5c : la page Confidentialité décrit le Foyer là où il est actif, et seulement là.
// BOUSSOLE_TEST_URL=http://localhost:3000 NEXT_PUBLIC_HOUSEHOLD_ENABLED=true node --experimental-strip-types --test tests/browser/privacy-household.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const enabled = process.env.NEXT_PUBLIC_HOUSEHOLD_ENABLED !== 'false';
const clean = (text) => text.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.BOUSSOLE_CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

async function open(t) {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto('/confidentialite');
  await page.getByRole('heading', { name: 'Confidentialité', level: 1 }).waitFor();
  return page;
}

test('5c · Foyer activé : la section décrit chiffrement, métadonnées, clés, invitation, départ et suppression', { skip: !enabled }, async (t) => {
  const page = await open(t);
  const text = clean(await page.getByRole('region', { name: 'Foyer : budget partagé' }).innerText());
  for (const sentence of [
    // Charte §2.3 et spécification §6.4.
    'Les données personnelles de chaque membre restent privées.',
    'Start’OnLab gère les clés du Foyer et peut déchiffrer ses données pour les restituer à ses membres.',
    'Une personne qui peut se connecter à ton compte, par exemple avec ton mot de passe ou via ta boîte e-mail, peut aussi ouvrir ton Foyer.',
    'Un lien d’invitation est valable 7 jours, une seule fois.',
    'Toute personne qui obtient un lien encore valide peut rejoindre le Foyer avec son propre compte',
    'Certaines informations déjà consultées ou enregistrées par un ancien membre peuvent rester en sa possession',
    'Le fichier téléchargé n’est pas chiffré.',
    'Si tu supprimes ton compte, ton adhésion disparaît. Les entrées communes restent accessibles à l’autre membre et ton nom est retiré de leur attribution. Si tu es le dernier membre, le Foyer et ses entrées sont supprimés côté serveur.',
    'La base légale est l’exécution du service de partage demandé par les membres.',
  ]) assert.ok(text.includes(sentence), `manque : « ${sentence} »`);
  // Charte §2.3 : jamais de formulation accusatrice.
  assert.doesNotMatch(text, /exclu|viré|banni/i);
});

test('5c · Foyer désactivé : la page ne parle pas d’un service qui n’est pas proposé', { skip: enabled }, async (t) => {
  const page = await open(t);
  assert.equal(await page.getByRole('region', { name: 'Foyer : budget partagé' }).count(), 0);
  assert.doesNotMatch(clean(await page.locator('main').innerText()), /Foyer/);
});
