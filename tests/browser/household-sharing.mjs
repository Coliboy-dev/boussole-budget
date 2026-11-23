// Foyer PR 5a : invitation, rejoindre, arrêter le partage, quitter. API Supabase et route de clé simulées dans Chromium.
// Build avec NEXT_PUBLIC_HOUSEHOLD_ENABLED=true, NEXT_PUBLIC_SUPABASE_URL=https://c0-test.supabase.test
// et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=cle-fictive-c0.
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/household-sharing.mjs
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { emptyBudgetState, serializeBudget } from '../../lib/budget-state.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const origin = 'https://c0-test.supabase.test';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const H = '33333333-3333-4333-8333-333333333333';
const mA = '44444444-4444-4444-8444-444444444444';
const mB = '55555555-5555-4555-8555-555555555555';
const INVITATION = '66666666-6666-4666-8666-666666666666';
const localBudget = serializeBudget({ ...emptyBudgetState, currentBalance: 800, balanceDate: '2026-11-21' });

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.BOUSSOLE_CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

function session(userId) {
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600 })).toString('base64url');
  return {
    access_token: ['eyJhbGciOiJIUzI1NiJ9', claims, 'fictif'].join('.'),
    refresh_token: 'refresh-fictif', token_type: 'bearer', expires_at: now + 3600, expires_in: 3600,
    user: { id: userId, email: userId === A ? 'a@example.test' : 'b@example.test', aud: 'authenticated' },
  };
}

/** Serveur simulé : l'état des adhésions évolue avec les RPC, comme les fonctions SQL de la PR 1. */
async function fixture(t, userId, members) {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  // pullRefused : le serveur refuse lectures et écritures alors que la liste peut encore dire « membre » (ordre forcé).
  const server = { members: new Map(members), calls: [], invitation: null, seq: 0, pullRefused: false };
  const own = () => (userId === A ? mA : mB);
  await context.route('**/api/household-key', (route) => route.fulfill({
    json: { material: randomBytes(32).toString('base64'), version: 1 },
  }));
  await context.route(origin + '/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postData() ? request.postDataJSON() : null;
    if (path.startsWith('/auth/v1/')) return route.fulfill({ json: path.endsWith('/user') ? session(userId).user : session(userId) });
    if (path === '/rest/v1/budget_vaults') return route.fulfill({ json: [] });
    if (path === '/rest/v1/household_records') return route.fulfill({ json: [] });
    const rpc = path.replace('/rest/v1/rpc/', '');
    server.calls.push({ rpc, body });
    const active = server.members.has(own());
    switch (rpc) {
      case 'household_sync_version': return route.fulfill({ json: 2 });
      case 'list_my_households': return route.fulfill({ json: active ? [{
        household_id: H, key_version: 1, created_at: '2026-11-20T10:00:00Z', member_id: own(), active_member_ids: [...server.members.keys()],
      }] : [] });
      case 'pull_records':
        if (!active || server.pullRefused) return route.fulfill({ status: 403, json: { code: '42501', message: 'Ce foyer est indisponible.' } });
        return route.fulfill({ json: [] });
      case 'upsert_records':
        if (!active || server.pullRefused) return route.fulfill({ status: 403, json: { code: '42501', message: 'Ce foyer est indisponible.' } });
        return route.fulfill({ json: body.records.map((record) => ({ record_id: record.record_id, seq: ++server.seq })) });
      case 'create_invitation':
        server.invitation = { id: INVITATION, tokenHash: body.token_hash };
        return route.fulfill({ json: INVITATION });
      case 'revoke_invitation':
        server.invitation = null;
        return route.fulfill({ json: null });
      case 'accept_invitation': {
        const valid = body.invitation === INVITATION && server.invitation
          && createHash('sha256').update(body.token).digest('hex') === server.invitation.tokenHash;
        if (!valid) return route.fulfill({ status: 400, json: { code: '22023', message: 'Cette invitation n’est plus valable.' } });
        server.invitation = null;
        server.members.set(mB, B);
        return route.fulfill({ json: [{ household_id: H, member_id: mB }] });
      }
      case 'leave_household':
        server.members.delete(own());
        return route.fulfill({ json: null });
      case 'stop_sharing_with':
        server.members.delete(body.other_member);
        return route.fulfill({ json: null });
      default: return route.fulfill({ status: 404, json: { message: `RPC imprévue : ${rpc}` } });
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(9000);
  await page.goto('/robots.txt');
  await page.evaluate(async ({ entries, user }) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('boussole-cloud', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('keys');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const transaction = open.result.transaction('keys', 'readwrite');
        transaction.objectStore('keys').put({ userId: user, key, salt: 'fictif', kdfIterations: 600000 }, 'budget');
        transaction.oncomplete = () => { open.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, {
    user: userId,
    entries: {
      'boussole-auth': JSON.stringify(session(userId)),
      'boussole-budget-v2': localBudget,
      'boussole-budget-owner-v1': JSON.stringify({ type: 'account', userId }),
    },
  });
  return { page, server };
}

function idb(page, id) {
  return page.evaluate((entry) => new Promise((resolve, reject) => {
    const open = indexedDB.open('boussole-cloud', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = open.result.transaction('keys').objectStore('keys').get(entry);
      request.onsuccess = () => {
        const value = request.result;
        open.result.close();
        resolve(value ? { ...value, key: value.key ? 'CryptoKey' : undefined } : null);
      };
      request.onerror = () => reject(request.error);
    };
  }), id);
}

async function waitForEntry(page, id, predicate) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (predicate(await idb(page, id))) return;
    await page.waitForTimeout(150);
  }
  assert.fail(`entrée ${id} absente`);
}

/** Déclenche « online » et « visible » puis attend que l'annuaire ait réellement interrogé le serveur. Aucune temporisation. */
async function nudge(page, times) {
  for (let index = 0; index < times; index++) {
    const listed = page.waitForResponse((response) => response.url().endsWith('/rpc/list_my_households'));
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await listed;
  }
}

const syncCalls = (server) => server.calls.filter(({ rpc }) => rpc === 'pull_records' || rpc === 'upsert_records').length;

const button = (page, name) => page.getByRole('button', { name, exact: true });

async function openHousehold(page) {
  await page.goto('/foyer');
  await page.getByRole('heading', { name: 'Membres du foyer' }).or(button(page, 'Ouvrir le foyer')).first().waitFor();
  if (await button(page, 'Ouvrir le foyer').count()) {
    await button(page, 'Ouvrir le foyer').click();
    // Ouvrir un foyer mène à l'accueil : attendre cette navigation avant de revenir sur /foyer.
    await page.waitForURL('**/dashboard');
    await page.getByRole('heading', { name: 'Aujourd’hui' }).waitFor();
    await page.goto('/foyer');
  }
  await page.getByRole('heading', { name: 'Membres du foyer' }).waitFor();
}

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
  await waitForEntry(page, `household-v1:${A}:${H}`, (value) => Boolean(value?.key));
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
  await waitForEntry(page, `household-directory:${B}`, (value) => value?.former?.length === 1);
  const cache = await idb(page, `household-v1:${B}:${H}`);
  assert.equal(cache.key, 'CryptoKey', 'la copie et sa clé restent sur l’appareil');
  const calls = syncCalls(server);
  await nudge(page, 4);
  assert.equal(syncCalls(server), calls, 'plus aucune lecture ni écriture après le retrait');
});

test('5a · ordre forcé : refus de lecture alors que la liste dit encore « membre » — aucune synchronisation ensuite', async (t) => {
  const { page, server } = await fixture(t, B, [[mA, A], [mB, B]]);
  await openHousehold(page);
  await waitForEntry(page, `household-v1:${B}:${H}`, (value) => Boolean(value?.key));
  server.pullRefused = true; // la liste des foyers continue de répondre « membre »

  const refused = page.waitForResponse((response) => response.url().endsWith('/rpc/pull_records') && response.status() === 403);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await refused;
  await waitForEntry(page, `household-v1:${B}:${H}`, (value) => value?.revoked === true);
  const afterRefusal = syncCalls(server);

  // Cinq occasions de resynchroniser, chacune confirmée par une réponse du serveur : aucune lecture ni écriture.
  await nudge(page, 5);
  assert.equal(syncCalls(server), afterRefusal, 'le refus est définitif pour cet appareil');
  const cache = await idb(page, `household-v1:${B}:${H}`);
  assert.equal(cache.revoked, true);
  assert.equal(cache.key, 'CryptoKey', 'la copie et sa clé restent sur l’appareil');
  assert.equal((await idb(page, `household-directory:${B}`)).selected, null, 'le foyer est refermé sans attendre la liste du serveur');
});
