// Build avec NEXT_PUBLIC_ACCOUNT_SIGNUP_ENABLED=true et la même origine Supabase simulée que account-guard.mjs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { deserializeBudget, emptyBudgetState, serializeBudget } from '../../lib/budget-state.ts';
import { decryptText, deriveKey, encryptText, fingerprint, newSalt } from '../../lib/cloud-crypto.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const origin = 'https://c0-test.supabase.test';
const userId = '11111111-1111-4111-8111-111111111111';
const authKey = 'boussole-auth';
const ownerKey = 'boussole-budget-owner-v1';
const budgetKey = 'boussole-budget-v2';
const pendingKey = 'boussole-vault-pending-v1';
const memoryKey = 'boussole-sync-v1';
const local = serializeBudget({ ...emptyBudgetState, currentBalance: 1234.56, balanceDate: '2026-11-21' });
const heading = (page, name) => page.getByRole('heading', { name, exact: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const stored = (page, key) => page.evaluate((name) => localStorage.getItem(name), key);

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.BOUSSOLE_CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

function session(expired = false) {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -300 : 3600);
  const claims = Buffer.from(JSON.stringify({ sub: userId, exp })).toString('base64url');
  return {
    access_token: ['eyJhbGciOiJIUzI1NiJ9', claims, 'fictif'].join('.'),
    refresh_token: 'renouvellement-fictif', token_type: 'bearer', expires_at: exp, expires_in: 3600,
    user: { id: userId, email: 'c1@example.test', aud: 'authenticated' },
  };
}

async function fixture(t, entries = {}) {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto('/robots.txt');
  await page.evaluate((storedEntries) => {
    for (const [key, value] of Object.entries(storedEntries)) localStorage.setItem(key, value);
  }, entries);
  return { context, page };
}

async function installKey(page, passphrase, salt) {
  await page.evaluate(async ({ id, passphrase, salt }) => {
    const encoder = new TextEncoder();
    const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600000,
      salt: Uint8Array.from(atob(salt), (char) => char.charCodeAt(0)) }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('boussole-cloud', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('keys');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const transaction = open.result.transaction('keys', 'readwrite');
        transaction.objectStore('keys').put({ userId: id, key, salt, kdfIterations: 600000 }, 'budget');
        transaction.oncomplete = () => { open.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, { id: userId, passphrase, salt });
}

test('C1 — inscription explicite puis réponse du premier coffre perdue, dépense ajoutée et rechargement', { timeout: 40000 }, async (t) => {
  const { context, page } = await fixture(t);
  let vault;
  let readBarrier;
  const actions = [];
  await context.route(origin + '/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/auth/v1/otp') {
      assert.equal(request.postDataJSON().create_user, true);
      return route.fulfill({ json: {} });
    }
    if (path === '/auth/v1/verify') return route.fulfill({ json: session() });
    if (path === '/rest/v1/budget_vaults') {
      if (request.method() === 'GET') {
        if (readBarrier) await readBarrier;
        return route.fulfill({ json: vault ? [vault] : [] });
      }
      actions.push(request.method());
      if (request.method() === 'POST') {
        assert.equal(vault, undefined);
        vault = { ...request.postDataJSON(), updated_at: '2026-11-21T10:00:00Z' };
        return route.abort('failed');
      }
      if (request.method() === 'PATCH') {
        assert.match(request.url(), /version=eq\.1/);
        vault = { ...vault, ...request.postDataJSON() };
        return route.fulfill({ json: [{ version: vault.version }] });
      }
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Créer mon compte', exact: true }).click();
  await page.locator('input[name=email]').fill('c1@example.test');
  await button(page, 'Recevoir un code').click();
  await page.locator('input[name=code]').fill('111111');
  await button(page, 'Confirmer mon adresse').click();
  await heading(page, 'Enregistre ta phrase secrète').waitFor();
  const phrase = await page.locator('input[name=passphrase]').inputValue();
  assert.match(phrase, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}(?:-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}){3}$/);
  assert.equal(await button(page, 'Continuer').isDisabled(), true);
  await page.getByRole('checkbox').check();
  await button(page, 'Continuer').click();
  await page.locator('input[name=balance]').fill('1200');
  await button(page, 'Continuer').click();
  await button(page, 'Pas de rentrée confirmée').click();
  await button(page, 'Calculer sans ajouter de facture').click();
  await page.getByRole('alert').filter({ hasText: 'La copie en ligne n’a pas pu être créée.' }).waitFor();
  assert.deepEqual(actions, ['POST']);
  const first = await stored(page, budgetKey);
  const key = await deriveKey(phrase, vault.salt, vault.kdf_iterations);
  assert.equal(await decryptText(key, vault), first);
  assert.deepEqual(JSON.parse(await stored(page, pendingKey)), { userId, fingerprint: await fingerprint(first) });
  assert.equal(await page.getByText('Copie en ligne créée.', { exact: true }).count(), 0);

  await button(page, 'Ajouter une dépense').click();
  await page.locator('input[name=amount]').fill('27.50');
  await page.getByRole('radio', { name: 'Courses', exact: true }).check();
  await button(page, 'Ajouter la dépense').click();
  await page.waitForFunction(([keyName, previous]) => localStorage.getItem(keyName) !== previous, [budgetKey, first]);
  const updated = await stored(page, budgetKey);
  assert.notEqual(updated, first);
  let release;
  readBarrier = new Promise((resolve) => { release = resolve; });
  t.after(release);
  await page.reload();
  await page.getByText('Copie en ligne en attente de confirmation.', { exact: true }).waitFor();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.deepEqual(actions, ['POST']);
  assert.ok(await stored(page, pendingKey));
  release();
  await page.waitForFunction((keyName) => localStorage.getItem(keyName) === null, pendingKey);
  await page.waitForFunction((keyName) => JSON.parse(localStorage.getItem(keyName) ?? 'null')?.version === 2, memoryKey);
  assert.deepEqual(actions, ['POST', 'PATCH']);
  assert.equal(await page.getByText('Deux versions différentes de ton budget', { exact: true }).count(), 0);
  assert.deepEqual(deserializeBudget(await decryptText(key, vault)), deserializeBudget(updated));
});

test('C1 — le propriétaire accède au budget pendant le renouvellement, un refus le masque', { timeout: 25000 }, async (t) => {
  const { context, page } = await fixture(t, {
    [authKey]: JSON.stringify(session(true)), [ownerKey]: JSON.stringify({ type: 'account', userId }), [budgetKey]: local,
  });
  const requests = [];
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  t.after(release);
  await context.route(origin + '/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/token') {
      await barrier;
      return route.fulfill({ status: 400, json: { code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' } });
    }
    requests.push(path);
    return route.fulfill({ status: 404 });
  });
  await installKey(page, 'ma phrase de test isolé', newSalt());
  await page.goto('/dashboard');
  await heading(page, 'Aujourd’hui').waitFor();
  assert.match(await page.locator('body').innerText(), /1[\s\u202f]*234,56/);
  assert.deepEqual(requests, []);
  release();
  await heading(page, 'Aujourd’hui').waitFor({ state: 'hidden' });
  await heading(page, 'Compte et sécurité').waitFor();
  assert.equal(await stored(page, budgetKey), local);
  assert.deepEqual(requests, []);
});

test('C1 — un rattachement illisible sans session redevient invité', async (t) => {
  const { context, page } = await fixture(t, { [ownerKey]: '!', [budgetKey]: local, [memoryKey]: 'ancienne mémoire' });
  await context.route(origin + '/**', (route) => route.abort());
  await page.goto('/dashboard');
  await heading(page, 'Aujourd’hui').waitFor();
  assert.deepEqual(JSON.parse(await stored(page, ownerKey)), { type: 'guest' });
  assert.equal(await stored(page, memoryKey), null);
  assert.equal(await stored(page, budgetKey), local);
});

test('C1 — les erreurs réseau de renouvellement gardent le budget disponible puis la synchronisation reprend', { timeout: 55000 }, async (t) => {
  const passphrase = 'ma phrase de test isolé';
  const salt = newSalt();
  const encrypted = await encryptText(await deriveKey(passphrase, salt), local);
  const vault = { ...encrypted, salt, version: 1, kdf_iterations: 600000, updated_at: '2026-11-21T10:00:00Z' };
  const { context, page } = await fixture(t, {
    [authKey]: JSON.stringify(session(true)), [ownerKey]: JSON.stringify({ type: 'account', userId }), [budgetKey]: local,
    [memoryKey]: JSON.stringify({ userId, version: 1, fingerprint: await fingerprint(local) }),
  });
  await installKey(page, passphrase, salt);
  let online = false;
  let attempts = 0;
  const vaultRequests = [];
  await context.route(origin + '/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/auth/v1/token') {
      attempts++;
      if (online) return route.fulfill({ json: session() });
      return route.fulfill({ status: 503, json: { message: 'Réseau indisponible' } });
    }
    if (path === '/rest/v1/budget_vaults') {
      vaultRequests.push(request.method());
      return route.fulfill({ json: [vault] });
    }
    return route.fulfill({ status: 404 });
  });
  const firstRetry = page.waitForResponse((response) => new URL(response.url()).pathname === '/auth/v1/token' && response.status() === 503);
  await page.goto('/synchronisation');
  await page.getByText(/Ton budget est disponible sur cet appareil/).waitFor();
  await firstRetry;
  await delay(31500); // Laisser finir le cycle de renouvellement réel du SDK.
  assert.ok(attempts > 1);
  await page.getByText(/Ton budget est disponible sur cet appareil/).waitFor();
  assert.deepEqual(vaultRequests, []);
  online = true;
  await page.clock.setSystemTime(new Date(Date.now() + 65000)); // Dépasser le délai de reprise du SDK après un échec.
  await button(page, 'Vérifier la connexion').click();
  await page.getByRole('status').filter({ hasText: 'Synchronisé' }).waitFor();
  assert.ok(vaultRequests.length > 0);
  assert.ok(vaultRequests.every((method) => method === 'GET'));
  assert.equal(await stored(page, budgetKey), local);
});

for (const [kind, auth] of [['active', JSON.stringify(session())], ['illisible', '!']]) {
  test('C1 — un rattachement illisible avec une session ' + kind + ' reste protégé', async (t) => {
    const { context, page } = await fixture(t, { [ownerKey]: '!', [budgetKey]: local, [authKey]: auth });
    await context.route(origin + '/**', (route) => route.abort());
    await page.goto('/dashboard');
    await heading(page, 'Ce budget est protégé').waitFor();
    assert.equal(await stored(page, ownerKey), '!');
    assert.equal(await stored(page, budgetKey), local);
    assert.doesNotMatch(await page.locator('body').innerText(), /1[\s\u202f]*234,56/);
  });
}

test('C1 — une transition interrompue reprend et demande un choix si un second appareil a créé un autre coffre', async (t) => {
  const passphrase = 'ma phrase de test isolé';
  const salt = newSalt();
  const otherBudget = serializeBudget({ ...emptyBudgetState, currentBalance: 501, balanceDate: '2026-11-21' });
  const encrypted = await encryptText(await deriveKey(passphrase, salt), otherBudget);
  const vault = { ...encrypted, salt, version: 1, kdf_iterations: 600000, updated_at: '2026-11-21T10:00:00Z' };
  const pending = JSON.stringify({ userId, fingerprint: await fingerprint(local) });
  const { context, page } = await fixture(t, {
    [authKey]: JSON.stringify(session()), [ownerKey]: JSON.stringify({ type: 'transition', userId }),
    [budgetKey]: local, [pendingKey]: pending,
  });
  await installKey(page, passphrase, salt);
  const requests = [];
  let exists = false;
  await context.route(origin + '/rest/v1/budget_vaults**', async (route) => {
    const method = route.request().method();
    requests.push(method);
    if (method === 'GET') return route.fulfill({ json: exists ? [vault] : [] });
    if (method === 'POST') {
      exists = true;
      return route.fulfill({ status: 409, json: { code: '23505', message: 'Coffre déjà présent' } });
    }
    return route.fulfill({ status: 400 });
  });
  await page.goto('/synchronisation', { waitUntil: 'domcontentloaded' });
  await page.getByText('Deux versions différentes de ton budget', { exact: true }).waitFor();
  assert.deepEqual(JSON.parse(await stored(page, ownerKey)), { type: 'account', userId });
  assert.deepEqual(requests, ['GET', 'POST', 'GET']);
  assert.equal(await stored(page, pendingKey), pending);
  assert.equal(await stored(page, budgetKey), local);
  assert.equal(await stored(page, memoryKey), null);
});

test('C1 — l’inscription depuis un budget existant attend une confirmation d’association', async (t) => {
  const { context, page } = await fixture(t, { [budgetKey]: local });
  const writes = [];
  await context.route(origin + '/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/auth/v1/otp') {
      assert.equal(request.postDataJSON().create_user, true);
      return route.fulfill({ json: {} });
    }
    if (path === '/auth/v1/verify') return route.fulfill({ json: session() });
    if (path === '/rest/v1/budget_vaults' && request.method() === 'GET') {
      const [saved] = writes;
      return route.fulfill({ json: saved ? [{ ...saved, updated_at: '2026-11-21T10:00:00Z' }] : [] });
    }
    if (path === '/rest/v1/budget_vaults' && request.method() === 'POST') {
      writes.push(request.postDataJSON());
      return route.fulfill({ status: 201 });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/synchronisation');
  await button(page, 'Créer un compte pour ce budget').click();
  await page.locator('input[name=email]').fill('c1@example.test');
  await button(page, 'Recevoir un code').click();
  await page.locator('input[name=code]').fill('111111');
  await button(page, 'Confirmer mon adresse').click();
  await heading(page, 'Enregistre ta phrase secrète').waitFor();
  const phrase = await page.locator('input[name=passphrase]').inputValue();
  await page.getByRole('checkbox').check();
  await button(page, 'Continuer').click();
  await heading(page, 'Choisir le budget de ce compte').waitFor();
  assert.deepEqual(writes, []);
  assert.equal(await stored(page, budgetKey), local);
  await button(page, 'Associer ce budget à mon compte').click();
  await page.getByText('Copie en ligne créée.', { exact: true }).waitFor();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].user_id, userId);
  const storedKey = await deriveKey(phrase, writes[0].salt, writes[0].kdf_iterations);
  assert.equal(await decryptText(storedKey, writes[0]), local);
});
