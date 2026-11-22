// Build et lancement avec NEXT_PUBLIC_SUPABASE_URL=https://c0-test.supabase.test
// et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=cle-fictive-c0. Toute requête est interceptée.
// BOUSSOLE_TEST_URL=http://localhost:3000 node --experimental-strip-types --test tests/browser/account-guard.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { deserializeBudget, emptyBudgetState, serializeBudget } from '../../lib/budget-state.ts';
import { decryptText, deriveKey, encryptText, newSalt } from '../../lib/cloud-crypto.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const origin = 'https://c0-test.supabase.test';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const auth = 'boussole-auth';
const owner = 'boussole-budget-owner-v1';
const budget = 'boussole-budget-v2';
const memory = 'boussole-sync-v1';
const passphrase = 'ma phrase de test isolé';
const localBudget = serializeBudget({
  ...emptyBudgetState, currentBalance: 1234.56, balanceDate: '2026-11-21',
  userProfile: { ...emptyBudgetState.userProfile, firstName: 'Budget local privé' },
});

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

async function fixture(t, initial, { remote = null, hold = null } = {}) {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  let vault = remote;
  const writes = [];
  const otp = [];
  await context.route(origin + '/**', async (route) => {
    const request = route.request();
    const address = new URL(request.url());
    if (address.pathname === '/auth/v1/otp') {
      otp.push(request.postDataJSON());
      return route.fulfill({ json: {} });
    }
    if (address.pathname === '/auth/v1/verify') return route.fulfill({ json: session(B) });
    if (address.pathname === '/auth/v1/token') return route.fulfill({ json: session(B) });
    if (address.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (address.pathname === '/rest/v1/budget_vaults') {
      if (request.method() === 'GET') {
        if (hold && address.searchParams.get('user_id') === 'eq.' + A) await hold();
        return route.fulfill({ json: vault ? [vault] : [] });
      }
      const payload = request.postDataJSON();
      writes.push({ method: request.method(), payload });
      if (request.method() === 'POST') {
        vault = { ...payload, updated_at: '2026-11-21T10:00:00Z' };
        return route.fulfill({ status: 201 });
      }
      return route.fulfill({ status: 400, json: { message: 'Écriture imprévue dans ce test' } });
    }
    return route.fulfill({ status: 404 });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(9000);
  await page.goto('/robots.txt');
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, initial);
  return { context, page, writes, otp };
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
const heading = (page, name) => page.getByRole('heading', { name, exact: true });
function stored(page, key) { return page.evaluate((item) => localStorage.getItem(item), key); }

async function assertProtected(page) {
  await heading(page, 'Ce budget est protégé').waitFor();
  assert.equal(await heading(page, 'Aujourd’hui').count(), 0);
  assert.equal(await page.getByRole('navigation').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /1[\s\u202f]*234,56|Budget local privé/);
}

test('C0 — un budget déjà rattaché à A reste masqué avec une session B', async (t) => {
  const previous = JSON.stringify({ userId: A, fingerprint: 'ancienne-empreinte', version: 1 });
  const { page, writes } = await fixture(t, {
    [auth]: JSON.stringify(session(B)), [budget]: localBudget,
    [owner]: JSON.stringify({ type: 'account', userId: A }), [memory]: previous,
  });
  for (const path of ['/dashboard', '/analyse', '/sauvegarde']) {
    await page.goto(path);
    await assertProtected(page);
  }
  assert.deepEqual(JSON.parse(await stored(page, owner)), { type: 'account', userId: A });
  assert.equal(await stored(page, budget), localBudget);
  assert.equal(await stored(page, memory), previous);
  assert.deepEqual(writes, []);
});

test('C0 — un ancien budget reste visible et exportable hors ligne malgré une ancienne session', { timeout: 25000 }, async (t) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(9000);
  await page.goto('/dashboard');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.waitForFunction((key) => Boolean(localStorage.getItem(key)), owner);
  await page.goto('/robots.txt');
  await page.evaluate(({ entries, ownerKey }) => {
    localStorage.removeItem(ownerKey);
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, {
    ownerKey: owner,
    entries: {
      [budget]: localBudget,
      [memory]: JSON.stringify({ userId: A, fingerprint: 'ancienne-empreinte', version: 1 }),
      [auth]: JSON.stringify(session(A)),
    },
  });

  await context.setOffline(true);
  await page.goto('/dashboard');
  await heading(page, 'Aujourd’hui').waitFor();
  assert.match(await page.locator('body').innerText(), /1[\s\u202f]*234,56/);
  assert.deepEqual(JSON.parse(await stored(page, owner)), { type: 'guest' });
  assert.equal(await stored(page, memory), null);
  assert.equal(await stored(page, auth), null);
  assert.equal(await stored(page, budget), localBudget);

  await page.goto('/sauvegarde');
  const downloading = page.waitForEvent('download');
  await button(page, 'Télécharger le budget').click();
  const exported = await readFile(await (await downloading).path(), 'utf8');
  assert.deepEqual(deserializeBudget(exported), deserializeBudget(localBudget));
});

test('C0 — changer de compte dans un autre onglet interrompt un envoi préparé', { timeout: 18000 }, async (t) => {
  let releaseRead;
  let enterRead;
  const entered = new Promise((resolve) => { enterRead = resolve; });
  const pending = new Promise((resolve) => { releaseRead = resolve; });
  t.after(releaseRead);
  const { context, page, writes } = await fixture(t, {
    [auth]: JSON.stringify(session(A)), [budget]: localBudget,
    [owner]: JSON.stringify({ type: 'account', userId: A }),
  }, { hold: async () => { enterRead(); await pending; } });

  await page.evaluate(async (userId) => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('boussole-cloud', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('keys');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const transaction = open.result.transaction('keys', 'readwrite');
        transaction.objectStore('keys').put({ userId, key, salt: 'fictif', kdfIterations: 600000 }, 'budget');
        transaction.oncomplete = () => { open.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, A);
  await page.goto('/dashboard');
  await heading(page, 'Aujourd’hui').waitFor();
  await entered;
  const other = await context.newPage();
  await other.goto('/robots.txt');
  await other.evaluate(([key, value]) => localStorage.setItem(key, value), [auth, JSON.stringify(session(B))]);
  await assertProtected(page);
  await other.goto('/dashboard');
  await assertProtected(other);
  const lateRead = page.waitForResponse((response) => response.url().includes('user_id=eq.' + A));
  const unexpectedWrite = assert.rejects(page.waitForRequest(
    (request) => request.url().startsWith(origin) && ['POST', 'PATCH', 'DELETE'].includes(request.method()),
    { timeout: 500 },
  ), { name: 'TimeoutError' });
  releaseRead();
  await (await lateRead).finished();
  await unexpectedWrite;
  await page.bringToFront();
  await assertProtected(page);
  assert.equal(await stored(page, budget), localBudget);
  assert.deepEqual(writes, []);
});

test('C0 — la connexion d’un compte existant précède tout envoi et le choix d’association', async (t) => {
  const { page, writes, otp } = await fixture(t, { [budget]: localBudget });
  await page.goto('/synchronisation');
  await page.locator('input[name=email]').fill('b@example.test');
  await page.locator('input[name=password]').fill('un mot de passe long');
  await button(page, 'Me connecter').click();
  await page.locator('input[name=confirmation]').fill(passphrase);
  await page.locator('input[name=passphrase]').fill(passphrase);
  await button(page, 'Activer la synchronisation').click();
  await heading(page, 'Choisir le budget de ce compte').waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  assert.deepEqual(otp, []);
  assert.deepEqual(writes, []);
  assert.equal(await stored(page, budget), localBudget);
  await button(page, 'Associer ce budget à mon compte').click();
  await heading(page, 'Synchroniser mes appareils').waitFor();
  await page.getByRole('status').filter({ hasText: 'Synchronisé' }).waitFor();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.user_id, B);
  const storedKey = await deriveKey(passphrase, writes[0].payload.salt, writes[0].payload.kdf_iterations);
  assert.equal(await decryptText(storedKey, writes[0].payload), localBudget);
  await button(page, 'Se déconnecter de cet appareil').click();
  await page.getByText('Reconnecte-toi au compte de ce budget pour y accéder.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('navigation').count(), 0);
  assert.equal(await stored(page, budget), localBudget);
  assert.deepEqual(JSON.parse(await stored(page, owner)), { type: 'account', userId: B });
  assert.equal(writes.length, 1);
});

test('C0 — récupérer le coffre existant exige une confirmation distincte', async (t) => {
  const salt = newSalt();
  const key = await deriveKey(passphrase, salt);
  const remoteBudget = serializeBudget({ ...emptyBudgetState, currentBalance: 42, balanceDate: '2026-11-21' });
  const { page, writes } = await fixture(t, {
    [auth]: JSON.stringify(session(B)), [budget]: localBudget, [owner]: JSON.stringify({ type: 'guest' }),
  }, {
    remote: { ...(await encryptText(key, remoteBudget)), salt, version: 1, kdf_iterations: 600000 },
  });
  await page.goto('/analyse');
  await page.locator('input[name=passphrase]').fill(passphrase);
  await button(page, 'Déverrouiller').click();
  await button(page, 'Remplacer ce budget par celui de mon compte').click();
  await button(page, 'Confirmer le remplacement').waitFor();
  assert.equal(await stored(page, budget), localBudget);
  assert.deepEqual(writes, []);
  await button(page, 'Revenir au choix').click();
  await button(page, 'Annuler').click();
  await heading(page, 'Où part mon argent').waitFor();
  assert.equal(await stored(page, budget), localBudget);
  assert.deepEqual(writes, []);

  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [auth, JSON.stringify(session(B))]);
  await page.reload();
  await page.locator('input[name=passphrase]').fill(passphrase);
  await button(page, 'Déverrouiller').click();
  await button(page, 'Remplacer ce budget par celui de mon compte').click();
  await button(page, 'Confirmer le remplacement').click();
  await heading(page, 'Où part mon argent').waitFor();
  assert.equal(await stored(page, budget), remoteBudget);
  assert.deepEqual(JSON.parse(await stored(page, owner)), { type: 'account', userId: B });
  assert.deepEqual(writes, []);
});
