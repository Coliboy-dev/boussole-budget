// Foyer PR 5b : copie d'un ancien foyer — consultation hors ligne, export, effacement confirmé.
// Utilise le même drapeau Foyer pour le build et pour la recette sur l’API simulée.
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/household-copy.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { deserializeBudget } from '../../lib/budget-state.ts';
import { A, B, H, button, fixture, idb, mA, mB, openHousehold, origin, waitForEntry } from './household-mock.mjs';

const sharingEnabled = process.env.NEXT_PUBLIC_HOUSEHOLD_ENABLED !== 'false';

/** A enregistre un solde commun de 500 €, attend qu'il soit envoyé, puis quitte le foyer. */
async function formerHousehold(t, removedByPartner = false) {
  const { page, server } = await fixture(t, A, [[mA, A], [mB, B]]);
  await openHousehold(page);
  await page.goto('/dashboard');
  await button(page, 'Modifier le solde bancaire').or(button(page, 'Mettre à jour le solde bancaire')).first().click();
  await page.getByLabel('Solde bancaire actuel').fill('500');
  await button(page, 'OK').click();
  await waitForEntry(page, `household-v1:${A}:${H}`, 'confirmed');

  await page.goto('/foyer');
  await page.getByRole('heading', { name: 'Membres du foyer' }).waitFor();
  if (!removedByPartner) await button(page, 'Quitter le foyer').click();

  // Attendre la confirmation de l’absence d’adhésion par le serveur avant d’observer le réseau.
  const listed = page.waitForResponse(async (response) => response.url().endsWith('/rpc/list_my_households')
    && response.ok() && (await response.json()).length === 0);
  if (removedByPartner) {
    server.members.delete(mA);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
  } else {
    await button(page, 'Quitter ce foyer').click();
  }
  await listed;
  await page.getByText(/^Accès au foyer terminé le /).waitFor();
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

async function personalSnapshot(page) {
  return {
    budget: await page.evaluate(() => localStorage.getItem('boussole-budget-v2')),
    key: await idb(page, 'budget'),
  };
}

test('5b · Foyer désactivé : une ancienne copie reste inaccessible et aucune requête Foyer ne part', { skip: sharingEnabled }, async (t) => {
  const { page, server } = await fixture(t, A, []);
  const copyKey = `household-v1:${A}:${H}`;
  await page.evaluate(async ({ userId, householdId, copyKey }) => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('boussole-cloud', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction('keys', 'readwrite');
        const store = transaction.objectStore('keys');
        store.put({ selected: null, households: [], former: [{ id: householdId, leftAt: '2026-11-21T12:00:00Z' }] },
          `household-directory:${userId}`);
        store.put({ userId, householdId, key, keyVersion: 1, cursor: 0, confirmed: [], pending: [], revoked: true }, copyKey);
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      };
    });
  }, { userId: A, householdId: H, copyKey });
  const savedCopy = await idb(page, copyKey);
  assert.equal(savedCopy?.key, 'CryptoKey');
  const requests = watchNetwork(page);

  await page.goto('/foyer');
  await page.getByText('Bientôt disponible').waitFor();
  assert.equal(await page.getByText(/^Accès au foyer terminé le /).count(), 0);
  for (const name of ['Consulter la copie', 'Télécharger la copie', 'Effacer la copie de cet appareil']) {
    assert.equal(await button(page, name).count(), 0);
  }
  assert.deepEqual(await idb(page, copyKey), savedCopy);
  assert.deepEqual(server.calls, [], 'aucune RPC du Foyer');
  assert.deepEqual(requests.filter(url => /\/api\/household-key|\/rest\/v1\/household/.test(url)), []);
});

test('5b · la copie se consulte hors ligne, sans aucune requête, et reste chiffrée sur l’appareil', { skip: !sharingEnabled }, async (t) => {
  const { page } = await formerHousehold(t);
  const stored = await idb(page, `household-v1:${A}:${H}`);
  const atRest = JSON.stringify(stored);
  const personal = await personalSnapshot(page);
  assert.doesNotMatch(atRest, /checkpoint|50000|500,00/, 'aucun contenu en clair dans IndexedDB');
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify(Object.entries(localStorage))), /checkpoint|50000|500,00/,
    'aucun contenu en clair dans localStorage');
  assert.equal(stored.key, 'CryptoKey');
  assert.equal(stored.keyExtractable, false);
  const downloads = [];
  page.on('download', (download) => downloads.push(download));

  const requests = watchNetwork(page);
  await page.context().setOffline(true);
  await button(page, 'Consulter la copie').click();
  await page.getByRole('heading', { name: /^Copie en lecture seule, arrêtée le / }).waitFor();
  assert.match((await page.locator('main').innerText()).replace(/[  ]/g, ' '), /Solde du compte commun : 500,00 €/);
  assert.deepEqual(requests, [], 'consultation sans réseau');
  assert.equal(JSON.stringify(await idb(page, `household-v1:${A}:${H}`)), atRest, 'la copie stockée n’est pas réécrite');
  assert.deepEqual(await personalSnapshot(page), personal, 'le budget Personnel et sa clé restent inchangés après consultation');
  assert.deepEqual(downloads, [], 'consulter ne déclenche aucun export');
});

test('5b · l’export ne contient ni clé ni identifiant de compte et ne peut pas remplacer le budget Personnel', { skip: !sharingEnabled }, async (t) => {
  const { page } = await formerHousehold(t);
  const personal = await personalSnapshot(page);
  const requests = watchNetwork(page);
  await button(page, 'Consulter la copie').click();
  await page.getByText('Le fichier téléchargé n’est pas chiffré. Conserve-le dans un endroit sûr.').waitFor();
  const downloading = page.waitForEvent('download');
  await button(page, 'Télécharger la copie').click();
  const file = await downloading;
  assert.match(file.suggestedFilename(), /^capiste-copie-foyer-\d{4}-\d{2}-\d{2}\.json$/);
  const contents = await readFile(await file.path(), 'utf8');
  const exported = JSON.parse(contents);
  assert.equal(exported.format, 'capiste-copie-foyer');
  assert.equal(exported.version, 1);
  assert.equal(exported.budget.state.currentBalance, 50000, 'montant en centimes');
  for (const secret of [A, B, 'CryptoKey', '"key"', 'ciphertext', 'access_token']) {
    assert.ok(!contents.includes(secret), `l’export ne contient pas ${secret}`);
  }
  assert.throws(() => deserializeBudget(contents), /ne contient pas de sauvegarde/, 'refusé par la restauration du budget Personnel');
  assert.deepEqual(requests, [], 'export sans appel au serveur, même en ligne');
  assert.deepEqual(await personalSnapshot(page), personal, 'le budget Personnel et sa clé restent inchangés après export');
});

test('5b · l’effacement demande une confirmation et ne touche jamais le budget Personnel', { skip: !sharingEnabled }, async (t) => {
  const { page } = await formerHousehold(t);
  const personal = await personalSnapshot(page);
  assert.ok(personal.budget && personal.key, 'budget Personnel présent avant l’effacement');
  const requests = watchNetwork(page);
  await page.context().setOffline(true);

  await button(page, 'Effacer la copie de cet appareil').click();
  await page.getByText('Effacer définitivement la copie de ce foyer sur cet appareil ?').waitFor();
  await page.getByText('Ton budget Personnel et ses lignes liées au foyer ne sont pas modifiés.').waitFor();
  await button(page, 'Annuler').click();
  assert.equal((await idb(page, `household-v1:${A}:${H}`)).key, 'CryptoKey', 'annuler ne supprime rien');
  assert.deepEqual(await personalSnapshot(page), personal, 'le budget Personnel reste inchangé après annulation');

  await button(page, 'Effacer la copie de cet appareil').click();
  await button(page, 'Effacer la copie').click();
  await page.getByText(/^Accès au foyer terminé le /).waitFor({ state: 'detached' });
  assert.equal(await idb(page, `household-v1:${A}:${H}`), null, 'copie effacée');
  assert.equal((await idb(page, `household-directory:${A}`)).former, undefined);
  assert.deepEqual(await personalSnapshot(page), personal, 'le budget Personnel et sa clé restent inchangés après effacement');
  assert.deepEqual(requests, [], 'effacement sans réseau');
});

test('5b · l’effacement est refusé si un autre onglet a réintégré le foyer', { skip: !sharingEnabled }, async (t) => {
  const { page } = await formerHousehold(t);
  const personal = await personalSnapshot(page);
  const stored = await idb(page, `household-v1:${A}:${H}`);
  const requests = watchNetwork(page);
  await button(page, 'Effacer la copie de cet appareil').click();

  // Réunion des deux états possibles à l'écran et dans le stockage après une réintégration ailleurs.
  await page.evaluate(({ key, active }) => new Promise((resolve, reject) => {
    const open = indexedDB.open('boussole-cloud', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction('keys', 'readwrite');
      const records = transaction.objectStore('keys');
      const current = records.get(key);
      current.onsuccess = () => records.put({ ...current.result, households: [active] }, key);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }), {
    key: `household-directory:${A}`,
    active: { id: H, keyVersion: 1, createdAt: '2026-11-20T10:00:00Z' },
  });

  await button(page, 'Effacer la copie').click();
  await page.getByRole('alert').getByText('Seule la copie d’un ancien foyer peut être effacée.').waitFor();
  assert.deepEqual(await idb(page, `household-v1:${A}:${H}`), stored, 'la copie du foyer actif est intacte');
  assert.deepEqual(await personalSnapshot(page), personal, 'le budget Personnel reste inchangé après refus');
  assert.deepEqual(requests, [], 'le refus reste local');
});

test('5b · après un retrait distant, la consultation, l’export et l’effacement restent locaux', { skip: !sharingEnabled }, async (t) => {
  const { page } = await formerHousehold(t, true);
  const personal = await personalSnapshot(page);
  const requests = watchNetwork(page);

  await button(page, 'Consulter la copie').click();
  await page.getByRole('heading', { name: /^Copie en lecture seule, arrêtée le / }).waitFor();
  assert.deepEqual(await personalSnapshot(page), personal);
  const downloaded = page.waitForEvent('download');
  await button(page, 'Télécharger la copie').click();
  await downloaded;
  assert.deepEqual(await personalSnapshot(page), personal);
  await button(page, 'Effacer la copie de cet appareil').click();
  await button(page, 'Effacer la copie').click();
  await page.getByText(/^Accès au foyer terminé le /).waitFor({ state: 'detached' });
  assert.equal(await idb(page, `household-v1:${A}:${H}`), null);
  assert.deepEqual(await personalSnapshot(page), personal);
  assert.deepEqual(requests, [], 'aucun appel après la révocation, même en ligne');
});
