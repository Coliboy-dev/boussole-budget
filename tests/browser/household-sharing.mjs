// Foyer PR 5a : invitation, rejoindre, arrêter le partage, quitter. API Supabase et route de clé simulées dans Chromium.
// Build avec NEXT_PUBLIC_HOUSEHOLD_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=https://c0-test.supabase.test
// et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=cle-fictive-c0.
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/household-sharing.mjs
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import {
  A, B, H, INVITATION, baseURL, browser, button, fixture, holdDirectoryUpdate, idb, mA, mB, nudge, openHousehold, origin, syncCalls, waitForEntry,
} from './household-mock.mjs';

test('5a · inviter : le lien porte le jeton dont le serveur ne reçoit que l’empreinte, puis l’annulation', async (t) => {
  const { page, server } = await fixture(t, A, [[mA, A]]);
  await openHousehold(page);
  await page.getByText('Tu es pour l’instant le seul membre de ce foyer.').waitFor();
  await page.getByText('Envoie ce lien uniquement à la personne avec qui tu partages ce foyer. Il est valable 7 jours, une seule fois.').waitFor();
  await button(page, 'Créer un lien d’invitation').click();
  const link = new URL(await page.getByLabel('Lien d’invitation').inputValue());
  assert.equal(link.pathname, '/foyer/rejoindre');
  assert.equal(link.search, '');
  const params = new URLSearchParams(link.hash.slice(1));
  assert.equal(params.get('i'), INVITATION);
  assert.equal(createHash('sha256').update(params.get('t')).digest('hex'), server.invitation.tokenHash);
  assert.ok(!JSON.stringify(server.calls).includes(params.get('t')), 'le jeton ne part jamais au serveur');

  await button(page, 'Annuler l’invitation').click();
  await page.getByRole('status').filter({ hasText: 'Invitation annulée. Le lien ne fonctionne plus.' }).waitFor();
  assert.deepEqual(server.calls.filter(({ rpc }) => rpc === 'revoke_invitation').map(({ body }) => body), [{ h: H, invitation: INVITATION }]);
  await button(page, 'Créer un lien d’invitation').waitFor();
});

test('5a · rejoindre : le lien est accepté avec le compte connecté et retiré de l’adresse', async (t) => {
  const { page, server } = await fixture(t, B, [[mA, A]]);
  const token = randomBytes(32).toString('base64url');
  server.invitation = { id: INVITATION, tokenHash: createHash('sha256').update(token).digest('hex') };

  await page.goto(`/foyer/rejoindre#i=${INVITATION}&t=${token.slice(0, 20)}`);
  await page.getByRole('alert').filter({ hasText: 'Ce lien d’invitation est incomplet. Demande un nouveau lien.' }).waitFor();
  assert.equal(server.calls.filter(({ rpc }) => rpc === 'accept_invitation').length, 0);

  await page.goto(`/foyer/rejoindre#i=${INVITATION}&t=${token}`);
  await page.getByText('Tu rejoins ce foyer avec ton propre compte. Tes données personnelles restent privées.').waitFor();
  await button(page, 'Rejoindre ce foyer').click();
  await page.waitForURL('**/dashboard');
  assert.deepEqual(server.calls.filter(({ rpc }) => rpc === 'accept_invitation').map(({ body }) => body), [{ invitation: INVITATION, token }]);
  assert.equal(await page.evaluate(() => window.location.hash), '');
  await page.goBack();
  assert.ok(!(await page.evaluate(() => window.location.href)).includes(token), 'le jeton ne reste pas dans l’historique');
  assert.deepEqual((await idb(page, `household-directory:${B}`)).households.map(({ id }) => id), [H]);

  // Une invitation déjà utilisée est refusée.
  await page.goto(`/foyer/rejoindre#i=${INVITATION}&t=${token}`);
  await button(page, 'Rejoindre ce foyer').click();
  await page.getByRole('alert').filter({ hasText: 'Cette invitation n’est plus valable.' }).waitFor();
});

test('5a · rejoindre sans être connecté : aucun appel, invitation à se connecter', async (t) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const calls = [];
  await context.route(origin + '/**', (route) => { calls.push(route.request().url()); return route.fulfill({ status: 404, json: {} }); });
  const page = await context.newPage();
  await page.goto(`/foyer/rejoindre#i=${INVITATION}&t=${randomBytes(32).toString('base64url')}`);
  await page.getByText('Connecte-toi à ton propre compte, puis rouvre le lien d’invitation.').waitFor();
  assert.ok(!calls.some((url) => url.includes('accept_invitation')));
});

test('5a · quitter : textes de la charte, synchronisation arrêtée, copie chiffrée gardée', async (t) => {
  const { page, server } = await fixture(t, A, [[mA, A], [mB, B]]);
  await openHousehold(page);
  await page.getByText('Ce foyer est partagé avec Autre membre.').waitFor();
  await waitForEntry(page, `household-v1:${A}:${H}`, 'key');
  const cacheBefore = await idb(page, `household-v1:${A}:${H}`);
  assert.equal(cacheBefore.key, 'CryptoKey');

  await button(page, 'Quitter le foyer').click();
  for (const text of [
    'Les nouvelles informations de ce foyer ne seront plus partagées avec ce compte.',
    'Les données personnelles de chaque membre restent privées.',
    'Certaines informations déjà consultées ou enregistrées par un ancien membre peuvent rester en sa possession.',
    'Une copie du foyer reste sur cet appareil. Elle n’est plus mise à jour.',
  ]) await page.getByText(text, { exact: true }).waitFor();
  await button(page, 'Quitter ce foyer').click();
  await page.getByRole('status').filter({ hasText: 'Le partage de ce foyer a été désactivé.' }).first().waitFor();
  await page.getByText(/^Accès au foyer terminé le /).waitFor();
  assert.equal(server.calls.filter(({ rpc }) => rpc === 'leave_household').length, 1);

  const cache = await idb(page, `household-v1:${A}:${H}`);
  assert.equal(cache.revoked, true, 'synchronisation arrêtée');
  assert.equal(cache.key, 'CryptoKey', 'la clé reste sur l’appareil');
  assert.deepEqual(cache.confirmed, cacheBefore.confirmed, 'la copie chiffrée est conservée');
  const directory = await idb(page, `household-directory:${A}`);
  assert.deepEqual(directory.former.map(({ id }) => id), [H]);
  assert.equal(directory.selected, null);

  // Plus aucune lecture ni écriture du foyer, même au retour du réseau.
  const before = syncCalls(server);
  await nudge(page, 3);
  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Aujourd’hui' }).waitFor();
  await nudge(page, 2);
  assert.equal(syncCalls(server), before);
});

test('5a · arrêter le partage : l’autre membre est retiré, ce compte garde son accès', async (t) => {
  const { page, server } = await fixture(t, A, [[mA, A], [mB, B]]);
  await openHousehold(page);
  await button(page, 'Arrêter le partage avec Autre membre').click();
  await page.getByText('Les données personnelles de chaque membre restent privées.', { exact: true }).waitFor();
  assert.equal(await page.getByText('Une copie du foyer reste sur cet appareil. Elle n’est plus mise à jour.').count(), 0);
  await button(page, 'Arrêter le partage').click();
  await page.getByRole('status').filter({ hasText: 'Le partage de ce foyer a été désactivé.' }).waitFor();
  assert.deepEqual(server.calls.filter(({ rpc }) => rpc === 'stop_sharing_with').map(({ body }) => body), [{ h: H, other_member: mB }]);
  await page.getByText('Tu es pour l’instant le seul membre de ce foyer.').waitFor();
  assert.equal((await idb(page, `household-v1:${A}:${H}`)).revoked, undefined);
});

test('5a · accès retiré par l’autre membre : copie gardée, foyer noté comme ancien, plus de synchronisation', async (t) => {
  const { page, server } = await fixture(t, B, [[mA, A], [mB, B]]);
  await openHousehold(page);
  server.members.delete(mB);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  // Selon l'ordre des réponses, la synchronisation signale le retrait ou l'annuaire classe directement le foyer comme ancien.
  await page.getByText('Ce compte n’a plus accès à ce foyer.').or(page.getByText('Le partage de ce foyer a été désactivé.')).first().waitFor();
  await waitForEntry(page, `household-directory:${B}`, 'former');
  const cache = await idb(page, `household-v1:${B}:${H}`);
  assert.equal(cache.key, 'CryptoKey', 'la copie et sa clé restent sur l’appareil');
  const calls = syncCalls(server);
  await nudge(page, 4);
  assert.equal(syncCalls(server), calls, 'plus aucune lecture ni écriture après le retrait');
});

test('5a · ordre forcé : refus de lecture alors que la liste dit encore « membre » — aucune synchronisation ensuite', async (t) => {
  const { page, server } = await fixture(t, B, [[mA, A], [mB, B]]);
  await openHousehold(page);
  await waitForEntry(page, `household-v1:${B}:${H}`, 'key');
  // Laisser la réponse d’IndexedDB en attente pendant que l’annuaire HTTP dit encore « membre ».
  // Le composant reste monté après le refus : sa garde doit bloquer les nouvelles tentatives.
  await holdDirectoryUpdate(page, B);
  server.pullRefused = true;

  const refused = page.waitForResponse((response) => response.url().endsWith('/rpc/pull_records') && response.status() === 403);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await refused;
  const directoryHeld = await page.waitForFunction(() => window.householdDirectoryHeld());
  await directoryHeld.dispose();
  const afterRefusal = server.calls.length;

  await nudge(page, 5);
  const laterCalls = server.calls.slice(afterRefusal);
  assert.equal(laterCalls.filter(({ rpc }) => rpc === 'pull_records').length, 0, 'aucune lecture après le refus');
  assert.equal(laterCalls.filter(({ rpc }) => rpc === 'upsert_records').length, 0, 'aucune écriture après le refus');

  await page.evaluate(() => window.releaseHouseholdDirectory());
  await page.getByRole('heading', { name: 'Membres du foyer' }).waitFor({ state: 'detached' });
  const cache = await idb(page, `household-v1:${B}:${H}`);
  assert.equal(cache.revoked, true);
  assert.equal(cache.key, 'CryptoKey', 'la copie et sa clé restent sur l’appareil');
  assert.equal((await idb(page, `household-directory:${B}`)).selected, null, 'le foyer est refermé sans attendre la liste du serveur');
});
