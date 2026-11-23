// Foyer PR 5b : copie d'un ancien foyer — consultation hors ligne, export, effacement confirmé.
// Même build que household-sharing.mjs (Foyer activé, Supabase simulé).
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/household-copy.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { deserializeBudget } from '../../lib/budget-state.ts';
import { A, B, H, button, fixture, idb, mA, mB, openHousehold, origin, waitForEntry } from './household-mock.mjs';

/** A enregistre un solde commun de 500 €, attend qu'il soit envoyé, puis quitte le foyer. */
async function formerHousehold(t) {
  const { page, server } = await fixture(t, A, [[mA, A], [mB, B]]);
  await openHousehold(page);
  await page.goto('/dashboard');
  await button(page, 'Modifier le solde bancaire').or(button(page, 'Mettre à jour le solde bancaire')).first().click();
  await page.getByLabel('Solde bancaire actuel').fill('500');
  await button(page, 'OK').click();
  await waitForEntry(page, `household-v1:${A}:${H}`, (value) => value?.confirmed?.length > 0 && value.pending.length === 0);

  await page.goto('/foyer');
  await button(page, 'Quitter le foyer').click();
  // Le départ se termine par une relecture de la liste des adhésions : on l'attend avant d'observer le réseau.
  const listed = page.waitForResponse((response) => response.url().endsWith('/rpc/list_my_households')
    && response.request().timing().startTime > 0);
  await button(page, 'Quitter ce foyer').click();
  await page.getByText(/^Accès au foyer terminé le /).waitFor();
  await listed;
  return { page, server };
}

/** Toute requête vers Supabase ou la route de clé après ce point est une synchronisation interdite. */
function watchNetwork(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(origin) || url.includes('/api/household-key')) requests.push(url);
  });
  return requests;
}

test('5b · la copie se consulte hors ligne, sans aucune requête, et reste chiffrée sur l’appareil', async (t) => {
  const { page } = await formerHousehold(t);
  const stored = await idb(page, `household-v1:${A}:${H}`);
  const atRest = JSON.stringify(stored.confirmed);
  assert.doesNotMatch(atRest, /checkpoint|50000|500,00/, 'aucun contenu en clair dans le stockage');
  assert.equal(stored.key, 'CryptoKey');

  const requests = watchNetwork(page);
  await page.context().setOffline(true);
  await button(page, 'Consulter la copie').click();
  await page.getByRole('heading', { name: /^Copie en lecture seule, arrêtée le / }).waitFor();
  assert.match((await page.locator('main').innerText()).replace(/[  ]/g, ' '), /Solde du compte commun : 500,00 €/);
  assert.deepEqual(requests, [], 'consultation sans réseau');
  assert.deepEqual(JSON.stringify((await idb(page, `household-v1:${A}:${H}`)).confirmed), atRest, 'la copie stockée n’est pas réécrite');
});

test('5b · l’export ne contient ni clé ni identifiant de compte et ne peut pas remplacer le budget Personnel', async (t) => {
  const { page } = await formerHousehold(t);
  const requests = watchNetwork(page);
  await page.context().setOffline(true);
  await button(page, 'Consulter la copie').click();
  await page.getByText('Le fichier téléchargé n’est pas chiffré. Conserve-le dans un endroit sûr.').waitFor();
  const downloading = page.waitForEvent('download');
  await button(page, 'Télécharger la copie').click();
  const file = await downloading;
  assert.match(file.suggestedFilename(), /^capiste-copie-foyer-\d{4}-\d{2}-\d{2}\.json$/);
  const contents = await readFile(await file.path(), 'utf8');
  const exported = JSON.parse(contents);
  assert.equal(exported.format, 'capiste-copie-foyer');
  assert.equal(exported.budget.state.currentBalance, 50000, 'montant en centimes');
  for (const secret of [A, B, 'CryptoKey', '"key"', 'ciphertext', 'access_token']) {
    assert.ok(!contents.includes(secret), `l’export ne contient pas ${secret}`);
  }
  assert.throws(() => deserializeBudget(contents), /ne contient pas de sauvegarde/, 'refusé par la restauration du budget Personnel');
  assert.deepEqual(requests, [], 'export sans réseau');
});

test('5b · l’effacement demande une confirmation et ne touche jamais le budget Personnel', async (t) => {
  const { page } = await formerHousehold(t);
  const personal = await page.evaluate(() => localStorage.getItem('boussole-budget-v2'));
  const personalKey = await idb(page, 'budget');
  assert.ok(personal && personalKey, 'budget Personnel présent avant l’effacement');
  const requests = watchNetwork(page);
  await page.context().setOffline(true);

  await button(page, 'Effacer la copie de cet appareil').click();
  await page.getByText('Effacer définitivement la copie de ce foyer sur cet appareil ?').waitFor();
  await page.getByText('Ton budget Personnel et ses lignes liées au foyer ne sont pas modifiés.').waitFor();
  await button(page, 'Annuler').click();
  assert.equal((await idb(page, `household-v1:${A}:${H}`)).key, 'CryptoKey', 'annuler ne supprime rien');

  await button(page, 'Effacer la copie de cet appareil').click();
  await button(page, 'Effacer la copie').click();
  await page.getByText(/^Accès au foyer terminé le /).waitFor({ state: 'detached' });
  assert.equal(await idb(page, `household-v1:${A}:${H}`), null, 'copie effacée');
  assert.equal((await idb(page, `household-directory:${A}`)).former, undefined);
  assert.equal(await page.evaluate(() => localStorage.getItem('boussole-budget-v2')), personal, 'budget Personnel inchangé');
  assert.deepEqual(await idb(page, 'budget'), personalKey, 'clé du budget Personnel conservée');
  assert.deepEqual(requests, [], 'effacement sans réseau');
});
