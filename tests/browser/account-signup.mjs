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

async function choosePassword(page) {
  await heading(page, 'Choisis ton mot de passe').waitFor();
  await page.locator('input[name=password]').fill('un mot de passe long');
  await page.locator('input[name=confirmation]').fill('un mot de passe long');
  await button(page, 'Enregistrer mon mot de passe').click();
}

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

test('C1 — le budget se crée avant de choisir la sauvegarde en ligne', async (t) => {
  const { context, page } = await fixture(t);
  const authRequests = [];
  await context.route(origin + '/auth/v1/**', (route) => {
    authRequests.push(route.request().postDataJSON());
    return route.fulfill({ json: {} });
  });

  await page.goto('/dashboard');
  await heading(page, 'Comment veux-tu commencer ?').waitFor();
  assert.equal(await page.getByRole('link', { name: 'Créer mon compte', exact: true }).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'J’ai déjà un compte', exact: true }).count(), 1);
  await button(page, 'Commencer mon budget').click();
  await page.locator('input[name=balance]').fill('1200');
  await button(page, 'Continuer').click();
  await button(page, 'Pas de rentrée confirmée').click();
  await button(page, 'Calculer sans ajouter de facture').click();

  await heading(page, 'Ton premier budget').waitFor();
  const budget = await stored(page, budgetKey);
  assert.equal(deserializeBudget(budget).currentBalance, 1200);
  assert.equal(await stored(page, authKey), null);
  assert.deepEqual(authRequests, []);
  assert.equal(await button(page, 'Voir mon tableau de bord').count(), 1);
  assert.equal(await page.getByRole('link', { name: 'Verrouiller Boussole avec un code', exact: true }).count(), 1);

  await page.getByRole('link', { name: 'Sauvegarder en ligne', exact: true }).click();
  await heading(page, 'Créer mon compte').waitFor();
  assert.equal(await stored(page, budgetKey), budget);
  assert.deepEqual(authRequests, []);
  await page.locator('input[name=email]').fill('c1@example.test');
  await button(page, 'Recevoir un code').click();
  await page.locator('input[name=code]').waitFor();
  assert.deepEqual(authRequests.map((request) => request.create_user), [true]);
});

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
    if (path === '/auth/v1/user' && request.method() === 'PUT') return route.fulfill({ json: session().user });
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

  // Exercer l’option de compte depuis les réglages pour conserver la recette du premier coffre.
  // Le nouveau parcours d’accueil est vérifié séparément et crée d’abord le budget invité.
  await page.goto('/synchronisation');
  await button(page, 'Créer un compte pour ce budget').click();
  await heading(page, 'Créer mon compte').waitFor();
  assert.equal(await page.getByText(/Toute personne qui a accès à ta boîte e-mail peut ouvrir ta copie en ligne/).count(), 0);
  await page.locator('input[name=email]').fill('c1@example.test');
  await button(page, 'Recevoir un code').click();
  await page.locator('input[name=code]').fill('111111');
  await button(page, 'Confirmer mon adresse').click();
  await choosePassword(page);
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
  // La liste conserve l’empreinte du premier envoi, y compris quand sa réponse se perd.
  assert.deepEqual(JSON.parse(await stored(page, pendingKey)), { userId, fingerprints: [await fingerprint(first)] });
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
  const localSalt = newSalt();
  const salt = newSalt();
  const otherBudget = serializeBudget({ ...emptyBudgetState, currentBalance: 501, balanceDate: '2026-11-21' });
  const encrypted = await encryptText(await deriveKey(passphrase, salt), otherBudget);
  const vault = { ...encrypted, salt, version: 1, kdf_iterations: 600000, updated_at: '2026-11-21T10:00:00Z' };
  const pending = JSON.stringify({ userId, fingerprints: [await fingerprint(local)] });
  const { context, page } = await fixture(t, {
    [authKey]: JSON.stringify(session()), [ownerKey]: JSON.stringify({ type: 'transition', userId }),
    [budgetKey]: local, [pendingKey]: pending,
  });
  await installKey(page, passphrase, localSalt);
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
  await page.getByText('Ton compte a déjà une copie en ligne créée sur un autre appareil. Saisis ta phrase secrète pour la comparer.', { exact: true }).waitFor();
  assert.equal(await stored(page, pendingKey), pending);
  assert.deepEqual(requests, ['GET', 'POST', 'GET']);
  await page.locator('input[name=passphrase]').fill(passphrase);
  await button(page, 'Déverrouiller').click();
  await page.getByText('Deux versions différentes de ton budget', { exact: true }).waitFor();
  assert.deepEqual(JSON.parse(await stored(page, ownerKey)), { type: 'account', userId });
  // Deux sels différents exigent une nouvelle lecture puis une comparaison avec la clé du coffre distant.
  assert.equal(requests.filter((method) => method === 'POST').length, 1);
  assert.ok(requests.every((method) => method === 'GET' || method === 'POST'));
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
    if (path === '/auth/v1/user' && request.method() === 'PUT') return route.fulfill({ json: session().user });
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
  await choosePassword(page);
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

test('C1 — une insertion retardée reconnue après un doublon laisse partir la dépense ajoutée', async (t) => {
  const passphrase = 'ma phrase de test isolé';
  const salt = newSalt();
  const { context, page } = await fixture(t, {
    [authKey]: JSON.stringify(session()), [ownerKey]: JSON.stringify({ type: 'account', userId }),
    [budgetKey]: local, [pendingKey]: JSON.stringify({ userId, fingerprints: [await fingerprint(local)] }),
  });
  await installKey(page, passphrase, salt);
  let first;
  let vault;
  const writes = [];
  await context.route(origin + '/rest/v1/budget_vaults**', async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'GET') return route.fulfill({ json: vault ? [vault] : [] });
    writes.push(method);
    if (method === 'POST' && !first) {
      first = { ...request.postDataJSON(), updated_at: '2026-11-21T10:00:00Z' };
      return route.abort('failed');
    }
    if (method === 'POST') {
      vault = first;
      return route.fulfill({ status: 409, json: { code: '23505', message: 'Coffre déjà présent' } });
    }
    if (method === 'PATCH') {
      assert.match(request.url(), /version=eq\.1/);
      vault = { ...vault, ...request.postDataJSON() };
      return route.fulfill({ json: [{ version: vault.version }] });
    }
    return route.fulfill({ status: 400 });
  });
  await page.goto('/dashboard');
  await page.getByRole('alert').filter({ hasText: 'La copie en ligne n’a pas pu être créée.' }).waitFor();
  await button(page, 'Ajouter une dépense').click();
  await page.locator('input[name=amount]').fill('27.50');
  await page.getByRole('radio', { name: 'Courses', exact: true }).check();
  await button(page, 'Ajouter la dépense').click();
  await page.waitForFunction(([keyName, previous]) => localStorage.getItem(keyName) !== previous, [budgetKey, local]);
  const updated = await stored(page, budgetKey);
  await page.goto('/synchronisation');
  await page.getByRole('status').filter({ hasText: 'Synchronisé' }).waitFor();
  assert.deepEqual(writes, ['POST', 'POST', 'PATCH']);
  assert.equal(await stored(page, pendingKey), null);
  assert.equal(await decryptText(await deriveKey(passphrase, salt), vault), updated);
});

test('C1 — une association interrompue avant le rattachement peut être confirmée après rechargement', async (t) => {
  const passphrase = 'ma phrase de test isolé';
  const { context, page } = await fixture(t, {
    [authKey]: JSON.stringify(session()), [ownerKey]: JSON.stringify({ type: 'guest' }), [budgetKey]: local,
  });
  await page.addInitScript(({ ownerKey, pendingKey }) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === ownerKey && JSON.parse(value).type === 'account'
        && localStorage.getItem(pendingKey) && sessionStorage.getItem('interruption-test') === null) {
        sessionStorage.setItem('interruption-test', 'faite');
        throw new Error('Interruption simulée avant le rattachement');
      }
      setItem.call(this, name, value);
    };
  }, { ownerKey, pendingKey });
  let vault;
  await context.route(origin + '/rest/v1/budget_vaults**', (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: vault ? [vault] : [] });
    assert.equal(request.method(), 'POST');
    assert.equal(vault, undefined);
    vault = { ...request.postDataJSON(), updated_at: '2026-11-21T10:00:00Z' };
    return route.fulfill({ status: 201 });
  });
  const confirm = async () => {
    await page.locator('input[name=passphrase]').fill(passphrase);
    await page.locator('input[name=confirmation]').fill(passphrase);
    await button(page, 'Activer la synchronisation').click();
    await heading(page, 'Choisir le budget de ce compte').waitFor();
    await button(page, 'Associer ce budget à mon compte').click();
  };
  await page.goto('/synchronisation');
  await confirm();
  await page.getByRole('alert').filter({ hasText: 'Interruption simulée avant le rattachement' }).waitFor();
  assert.deepEqual(JSON.parse(await stored(page, ownerKey)), { type: 'guest' });
  assert.ok(await stored(page, pendingKey));
  assert.equal(vault, undefined);
  await page.reload();
  await page.locator('input[name=passphrase]').waitFor();
  assert.equal(await stored(page, pendingKey), null);
  await confirm();
  await page.getByRole('status').filter({ hasText: 'Synchronisé' }).waitFor();
  assert.deepEqual(JSON.parse(await stored(page, ownerKey)), { type: 'account', userId });
  assert.equal(await stored(page, budgetKey), local);
  assert.equal(await stored(page, pendingKey), null);
  assert.equal(await decryptText(await deriveKey(passphrase, vault.salt), vault), local);
});

for (const scenario of ['absent', 'identique', 'différent']) {
  test('C1 — un marqueur illisible est récupéré avec un coffre ' + scenario, async (t) => {
    const passphrase = 'ma phrase de test isolé';
    const salt = newSalt();
    const key = await deriveKey(passphrase, salt);
    const other = serializeBudget({ ...emptyBudgetState, currentBalance: 501, balanceDate: '2026-11-21' });
    const initial = scenario === 'différent' ? other : local;
    let vault = scenario === 'absent' ? undefined : { ...(await encryptText(key, initial)), salt, version: 1,
      kdf_iterations: 600000, updated_at: '2026-11-21T10:00:00Z' };
    const { context, page } = await fixture(t, {
      [authKey]: JSON.stringify(session()), [ownerKey]: JSON.stringify({ type: 'account', userId }),
      [budgetKey]: local, [pendingKey]: '!',
    });
    await installKey(page, passphrase, salt);
    const writes = [];
    await context.route(origin + '/rest/v1/budget_vaults**', (route) => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: vault ? [vault] : [] });
      writes.push(request.method());
      assert.equal(request.method(), 'POST');
      assert.equal(vault, undefined);
      vault = { ...request.postDataJSON(), updated_at: '2026-11-21T10:00:00Z' };
      return route.fulfill({ status: 201 });
    });
    await page.goto('/synchronisation');
    if (scenario === 'différent') {
      await page.getByText('Deux versions différentes de ton budget', { exact: true }).waitFor();
      assert.deepEqual(JSON.parse(await stored(page, pendingKey)), { userId, fingerprints: [] });
      assert.equal(await stored(page, memoryKey), null);
    } else {
      await page.getByRole('status').filter({ hasText: 'Synchronisé' }).waitFor();
      assert.equal(await stored(page, pendingKey), null);
      assert.deepEqual(JSON.parse(await stored(page, memoryKey)), { userId, version: 1, fingerprint: await fingerprint(local) });
    }
    assert.deepEqual(writes, scenario === 'absent' ? ['POST'] : []);
    assert.equal(await stored(page, budgetKey), local);
    assert.equal(await decryptText(key, vault), initial);
  });
}
