// Build avec les inscriptions et les clés gérées activées. Les API sont simulées dans Chromium.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { deserializeBudget, emptyBudgetState, serializeBudget } from '../../lib/budget-state.ts';
import { deriveKey, encryptText, newSalt } from '../../lib/cloud-crypto.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const origin = 'https://c0-test.supabase.test';
const userId = '11111111-1111-4111-8111-111111111111';
const material = Buffer.alloc(32, 93).toString('base64');
const budgetKey = 'boussole-budget-v2';
const oldBudget = serializeBudget({ ...emptyBudgetState, currentBalance: 789.25, balanceDate: '2026-11-21' });
const heading = (page, name) => page.getByRole('heading', { name, exact: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });

let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.BOUSSOLE_CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

const exp = Math.floor(Date.now() / 1000) + 3600;
const session = {
  access_token: ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: userId, exp })).toString('base64url'), 'fictif'].join('.'),
  refresh_token: 'renouvellement-fictif', token_type: 'bearer', expires_at: exp, expires_in: 3600,
  user: { id: userId, email: 'capiste@example.test', aud: 'authenticated' },
};

async function device(t, copy) {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  await context.route(origin + '/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/auth/v1/otp') {
      copy.otp.push(request.postDataJSON().create_user);
      return route.fulfill({ json: {} });
    }
    if (path === '/auth/v1/verify') return route.fulfill({ json: session });
    if (path === '/rest/v1/budget_vaults') {
      if (request.method() === 'GET') return route.fulfill({ json: copy.vault ? [copy.vault] : [] });
      if (request.method() === 'POST') {
        assert.equal(copy.vault, undefined);
        copy.vault = { ...request.postDataJSON(), updated_at: '2026-11-21T10:00:00Z' };
        return route.fulfill({ status: 201, body: '' });
      }
    }
    return route.fulfill({ status: 404 });
  });
  await context.route('**/api/budget-key', (route) => {
    assert.equal(route.request().method(), 'POST');
    assert.equal(route.request().headers().authorization, `Bearer ${session.access_token}`);
    copy.keyRequests++;
    return route.fulfill({ json: { material, version: 1 } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  return page;
}

async function authenticate(page, choice) {
  await button(page, choice).click();
  await page.locator('input[name=email]').fill('capiste@example.test');
  await button(page, 'Recevoir un code').click();
  await page.locator('input[name=code]').fill('111111');
  await button(page, choice === 'Créer mon compte' ? 'Confirmer mon adresse' : 'Me connecter').click();
}

async function setPin(page) {
  await heading(page, 'Protège ton budget').waitFor();
  await page.getByLabel('Code à 6 chiffres', { exact: true }).fill('726491');
  await page.getByLabel('Confirme le code', { exact: true }).fill('726491');
  await button(page, 'Enregistrer mon code').click();
}

const stored = (page, key) => page.evaluate((name) => localStorage.getItem(name), key);

test('inscription et récupération sur un autre appareil par e-mail, avec un code local et une copie chiffrée', async (t) => {
  const copy = { otp: [], keyRequests: 0 };
  const first = await device(t, copy);
  await first.goto('/depenses');
  await button(first, 'Créer mon compte').waitFor();
  assert.equal(await heading(first, 'Dépenses').count(), 0);
  await authenticate(first, 'Créer mon compte');
  await heading(first, 'Protège ton budget').waitFor();
  assert.equal(await first.locator('input[name=passphrase]').count(), 0);
  assert.equal(await stored(first, budgetKey), null);
  await setPin(first);
  await first.locator('input[name=balance]').fill('1200');
  await button(first, 'Continuer').click();
  await button(first, 'Pas de rentrée confirmée').click();
  await button(first, 'Calculer sans ajouter de facture').click();
  await heading(first, 'Ton premier budget').waitFor();
  assert.deepEqual(copy.otp, [true]);
  assert.equal(copy.vault.key_mode, 'managed_v1');
  assert.ok(copy.vault.ciphertext.length > 16);
  assert.ok(await stored(first, 'boussole-lock-v1'));

  const second = await device(t, copy);
  await second.goto('/dashboard');
  await authenticate(second, 'J’ai déjà un compte');
  await heading(second, 'Protège ton budget').waitFor();
  assert.equal(await stored(second, budgetKey), null);
  await setPin(second);
  await heading(second, 'Aujourd’hui').waitFor();
  assert.equal(deserializeBudget(await stored(second, budgetKey)).currentBalance, 1200);
  assert.equal(await second.locator('input[name=passphrase]').count(), 0);
  assert.deepEqual(copy.otp, [true, false]);
  assert.equal(copy.keyRequests, 2);
});

test('la connexion conserve la phrase de récupération d’un coffre historique', async (t) => {
  const phrase = 'ma phrase historique';
  const salt = newSalt();
  const kdf_iterations = 100_000;
  const copy = { otp: [], keyRequests: 0, vault: { user_id: userId, version: 1, key_mode: 'legacy', salt,
    kdf_iterations, updated_at: '2026-11-21T10:00:00Z', ...await encryptText(await deriveKey(phrase, salt, kdf_iterations), oldBudget) } };
  const page = await device(t, copy);
  await page.goto('/dashboard');
  await authenticate(page, 'J’ai déjà un compte');
  await page.locator('input[name=passphrase]').fill(phrase);
  await button(page, 'Déverrouiller').click();
  await setPin(page);
  await heading(page, 'Aujourd’hui').waitFor();
  assert.equal(deserializeBudget(await stored(page, budgetKey)).currentBalance, 789.25);
  assert.equal(copy.keyRequests, 0);
  assert.equal(copy.vault.key_mode, 'legacy');
});

test('le déverrouillage du téléphone peut être activé à l’inscription', async (t) => {
  const page = await device(t, { otp: [], keyRequests: 0 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true,
    },
  });
  await page.goto('/dashboard');
  await authenticate(page, 'Créer mon compte');
  await setPin(page);
  assert.equal(await page.locator('input[name=balance]').count(), 0);
  await button(page, 'Activer le déverrouillage avec le téléphone').click();
  await page.locator('input[name=balance]').waitFor();
  const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  assert.equal(credentials.length, 1);
  assert.ok(await stored(page, 'boussole-lock-v1'));
});

test('le code local suffit après l’annulation du déverrouillage du téléphone', async (t) => {
  const page = await device(t, { otp: [], keyRequests: 0 });
  await page.addInitScript(() => {
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => true;
    navigator.credentials.create = async () => { throw new DOMException('Annulé', 'NotAllowedError'); };
  });
  await page.goto('/dashboard');
  await authenticate(page, 'Créer mon compte');
  await setPin(page);
  await button(page, 'Activer le déverrouillage avec le téléphone').click();
  await page.getByRole('alert').filter({ hasText: 'Tu peux continuer avec ton code' }).waitFor();
  await button(page, 'Continuer avec mon code').click();
  await page.locator('input[name=balance]').waitFor();
  assert.ok(await stored(page, 'boussole-lock-v1'));
});
