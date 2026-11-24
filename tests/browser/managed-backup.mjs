// Build avec les inscriptions et les clés gérées activées. Exporte le même drapeau d’inscription pour les tests. Les API sont simulées dans Chromium.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { ACCOUNT_TRANSITION_LOCK, AUTH_STORAGE_KEY } from '../../lib/account-guard.ts';
import { deserializeBudget, emptyBudgetState, serializeBudget } from '../../lib/budget-state.ts';
import { deriveKey, encryptText, newSalt } from '../../lib/cloud-crypto.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const origin = 'https://c0-test.supabase.test';
const signupEnabled = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_ENABLED === 'true';
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
    if (path === '/auth/v1/verify') {
      if (request.postDataJSON().token !== '111111') {
        return route.fulfill({ status: 403, json: { code: 'otp_expired', message: 'Invalid token' } });
      }
      return route.fulfill({ json: session });
    }
    if (path === '/auth/v1/token') {
      const body = request.postDataJSON();
      copy.passwordLogins = (copy.passwordLogins ?? 0) + 1;
      if (body.password !== copy.password) {
        return route.fulfill({ status: 400, json: { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' } });
      }
      return route.fulfill({ json: session });
    }
    if (path === '/auth/v1/user' && request.method() === 'PUT') {
      await copy.beforePasswordResponse?.();
      copy.password = request.postDataJSON().password;
      return route.fulfill({ json: session.user });
    }
    if (path === '/auth/v1/logout') {
      copy.logoutRequested = true;
      return route.fulfill({ status: 204 });
    }
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

// Le budget se crée d’abord sur l’appareil, puis « Sauvegarder en ligne » ouvre l’inscription.
async function startGuestBudget(page) {
  if (signupEnabled) await button(page, 'Commencer mon budget').click();
  await firstBudget(page);
  await heading(page, 'Ton premier budget').waitFor();
}

async function signUp(page) {
  await startGuestBudget(page);
  await page.getByRole('link', { name: 'Sauvegarder en ligne', exact: true }).click();
  await page.locator('input[name=email]').fill('capiste@example.test');
  await button(page, 'Recevoir un code').click();
  await page.locator('input[name=code]').fill('111111');
  await button(page, 'Confirmer mon adresse').click();
}

async function associateBudget(page, copy) {
  await heading(page, 'Choisir le budget de ce compte').waitFor();
  await button(page, 'Associer ce budget à mon compte').click();
  for (let attempt = 0; attempt < 100 && !copy.vault; attempt++) await page.waitForTimeout(100);
  assert.ok(copy.vault, 'la copie en ligne a été créée');
}

async function openSignIn(page) {
  if (signupEnabled) {
    await page.getByRole('link', { name: 'J’ai déjà un compte', exact: true }).click();
  } else {
    await page.goto('/synchronisation');
  }
  await heading(page, 'Te connecter').waitFor();
}

// « J’ai déjà un compte » mène à Compte et sécurité ; une fois le budget récupéré, on revient sur l’accueil.
async function openTodayAfterRestore(page) {
  await page.waitForFunction((key) => localStorage.getItem(key) !== null, budgetKey);
  await page.goto('/dashboard');
  await heading(page, 'Aujourd’hui').waitFor();
}

async function choosePassword(page, password = 'un mot de passe long') {
  const formHeading = heading(page, 'Choisis ton mot de passe');
  await formHeading.waitFor();
  await page.locator('input[name=password]').fill(password);
  await page.locator('input[name=confirmation]').fill(password);
  await button(page, 'Enregistrer mon mot de passe').click();
  await formHeading.waitFor({ state: 'hidden' });
}

async function signIn(page, password) {
  await openSignIn(page);
  await page.locator('input[name=email]').fill('capiste@example.test');
  await page.locator('input[name=password]').fill(password);
  await button(page, 'Me connecter').click();
}

async function openRecovery(page) {
  await page.goto('/dashboard');
  await openSignIn(page);
  await button(page, 'Mot de passe oublié ou pas encore créé ?').click();
  await page.locator('input[name=email]').fill('capiste@example.test');
  await button(page, 'Recevoir un code').click();
}

async function submitRecoveryCode(page, code) {
  await page.locator('input[name=code]').fill(code);
  await button(page, 'Me connecter').click();
}

async function firstBudget(page) {
  await page.locator('input[name=balance]').fill('1200');
  await button(page, 'Continuer').click();
  await button(page, 'Pas de rentrée confirmée').click();
  await button(page, 'Calculer sans ajouter de facture').click();
}

const stored = (page, key) => page.evaluate((name) => localStorage.getItem(name), key);

test('le risque lié au mot de passe et à la messagerie figure dans la confidentialité et à l’inscription', async (t) => {
  const page = await device(t, { otp: [], keyRequests: 0 });
  await page.goto('/confidentialite');
  await page.getByText(/Toute personne qui connaît ton mot de passe, ou qui a accès à ta boîte e-mail, peut ouvrir ta copie en ligne/).waitFor();
  await page.getByText(/mot de passe unique.*double authentification/).waitFor();

  const notice = page.getByText(/Toute personne qui a accès à ta boîte e-mail peut ouvrir ta copie en ligne/);
  await page.goto('/dashboard');
  await startGuestBudget(page);
  const onlineBackup = page.getByRole('link', { name: 'Sauvegarder en ligne', exact: true });
  if (!signupEnabled) {
    assert.equal(await onlineBackup.count(), 0);
    return;
  }
  await onlineBackup.click();
  await heading(page, 'Créer mon compte').waitFor();
  await notice.waitFor();
  await button(page, 'J’ai déjà un compte').click();
  await heading(page, 'Te connecter').waitFor();
  assert.equal(await notice.count(), 0);
});

test('inscription par code puis mot de passe, et connexion par mot de passe sur un autre appareil, sans code local imposé', { skip: !signupEnabled }, async (t) => {
  const copy = { otp: [], keyRequests: 0 };
  const first = await device(t, copy);
  await first.goto('/dashboard');
  await heading(first, 'Comment veux-tu commencer ?').waitFor();
  await signUp(first);
  await choosePassword(first);
  assert.equal(copy.password, 'un mot de passe long');
  await associateBudget(first, copy);
  assert.deepEqual(copy.otp, [true]);
  assert.equal(copy.vault.key_mode, 'managed_v1');
  assert.equal(await stored(first, 'boussole-lock-v1'), null);

  const second = await device(t, copy);
  await second.goto('/dashboard');
  await signIn(second, 'un mot de passe long');
  await openTodayAfterRestore(second);
  assert.equal(deserializeBudget(await stored(second, budgetKey)).currentBalance, 1200);
  assert.equal(await stored(second, 'boussole-lock-v1'), null);
  assert.deepEqual(copy.otp, [true]);
  assert.equal(copy.keyRequests, 2);
});

test('un mauvais mot de passe ne connecte pas et ne montre aucun budget', async (t) => {
  const copy = { otp: [], keyRequests: 0, password: 'le bon mot de passe' };
  const page = await device(t, copy);
  await page.goto('/dashboard');
  await signIn(page, 'pas le bon mot de passe');
  await page.getByRole('alert').filter({ hasText: 'E-mail ou mot de passe incorrect.' }).waitFor();
  assert.equal(await heading(page, 'Aujourd’hui').count(), 0);
  assert.equal(copy.keyRequests, 0);
});

test('mot de passe oublié : code e-mail sans création de compte, puis nouveau mot de passe obligatoire', async (t) => {
  const copy = { otp: [], keyRequests: 0, password: 'ancien mot de passe' };
  const page = await device(t, copy);
  await page.goto('/dashboard');
  await openSignIn(page);
  await button(page, 'Mot de passe oublié ou pas encore créé ?').click();
  await page.locator('input[name=email]').fill('capiste@example.test');
  await button(page, 'Recevoir un code').click();
  await page.locator('input[name=code]').fill('111111');
  await button(page, 'Me connecter').click();
  await choosePassword(page, 'nouveau mot de passe');
  assert.deepEqual(copy.otp, [false]);
  assert.equal(copy.password, 'nouveau mot de passe');
  await page.locator('input[name=balance]').waitFor();
});

test('récupération : un code refusé laisse le champ et permet de réessayer', async (t) => {
  const copy = { otp: [], keyRequests: 0, password: 'ancien mot de passe' };
  const page = await device(t, copy);
  await openRecovery(page);
  await submitRecoveryCode(page, '000000');
  await page.getByRole('alert').filter({ hasText: 'Code incorrect ou expiré.' }).waitFor();
  assert.equal(await page.locator('input[name=code]').isVisible(), true);
  await submitRecoveryCode(page, '111111');
  await heading(page, 'Choisis ton mot de passe').waitFor();
  assert.deepEqual(copy.otp, [false]);
});

test('récupération : le choix du mot de passe survit au rechargement et à un autre onglet', async (t) => {
  const page = await device(t, { otp: [], keyRequests: 0 });
  await openRecovery(page);
  await submitRecoveryCode(page, '111111');
  await heading(page, 'Choisis ton mot de passe').waitFor();

  await page.reload();
  await heading(page, 'Choisis ton mot de passe').waitFor();
  const other = await page.context().newPage();
  await other.goto('/dashboard');
  await heading(other, 'Choisis ton mot de passe').waitFor();

  await choosePassword(page);
  await page.locator('input[name=balance]').waitFor();
  await other.locator('input[name=balance]').waitFor();
  await page.reload();
  await page.locator('input[name=balance]').waitFor();
});

test('une déconnexion dans un autre onglet attend le changement de mot de passe en cours', async (t) => {
  const copy = { otp: [], keyRequests: 0, password: 'ancien mot de passe', logoutRequested: false };
  const page = await device(t, copy);
  await page.goto('/dashboard');
  await signIn(page, copy.password);
  await firstBudget(page);
  await heading(page, 'Ton premier budget').waitFor();
  await page.goto('/synchronisation');
  await button(page, 'Changer mon mot de passe').click();
  await page.locator('input[name=password]').fill('nouveau mot de passe');
  await page.locator('input[name=confirmation]').fill('nouveau mot de passe');

  const other = await page.context().newPage();
  await other.goto('/synchronisation');
  await button(other, 'Se déconnecter de cet appareil').waitFor();
  const received = Promise.withResolvers();
  const release = Promise.withResolvers();
  t.after(() => release.resolve());
  copy.beforePasswordResponse = () => {
    received.resolve();
    return release.promise;
  };

  await button(page, 'Enregistrer mon mot de passe').click();
  await received.promise;
  await button(other, 'Se déconnecter de cet appareil').click();
  await other.waitForFunction(async ({ storageKey, lockName }) => {
    if (localStorage.getItem(storageKey) === null) return true;
    const { pending } = await navigator.locks.query();
    return pending.some((lock) => lock.name === lockName);
  }, { storageKey: AUTH_STORAGE_KEY, lockName: ACCOUNT_TRANSITION_LOCK });
  const logoutBeforePasswordResponse = copy.logoutRequested;
  release.resolve();

  assert.equal(logoutBeforePasswordResponse, false);
  await heading(other, 'Te connecter').waitFor();
  assert.equal(await stored(other, AUTH_STORAGE_KEY), null);
  assert.equal(copy.password, 'nouveau mot de passe');
});

test('la connexion par mot de passe conserve la phrase de récupération d’un coffre historique', async (t) => {
  const phrase = 'ma phrase historique';
  const salt = newSalt();
  const kdf_iterations = 100_000;
  const copy = { otp: [], keyRequests: 0, password: 'un mot de passe long', vault: { user_id: userId, version: 1, key_mode: 'legacy', salt,
    kdf_iterations, updated_at: '2026-11-21T10:00:00Z', ...await encryptText(await deriveKey(phrase, salt, kdf_iterations), oldBudget) } };
  const page = await device(t, copy);
  await page.goto('/dashboard');
  await signIn(page, copy.password);
  await page.locator('input[name=passphrase]').fill(phrase);
  await button(page, 'Déverrouiller').click();
  await openTodayAfterRestore(page);
  assert.equal(deserializeBudget(await stored(page, budgetKey)).currentBalance, 789.25);
  assert.equal(copy.keyRequests, 0);
  assert.equal(copy.vault.key_mode, 'legacy');
});

async function withAuthenticator(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}

test('Face ID et le code sont proposés une fois après la connexion, puis activés', { skip: !signupEnabled }, async (t) => {
  const copy = { otp: [], keyRequests: 0 };
  const page = await device(t, copy);
  const { cdp, authenticatorId } = await withAuthenticator(page);
  await page.goto('/dashboard');
  await signUp(page);
  await choosePassword(page);
  await associateBudget(page, copy);
  await heading(page, 'Ouvre l’app en un geste').waitFor();
  await page.getByLabel('Code à 6 chiffres', { exact: true }).fill('726491');
  await page.getByLabel('Confirme le code', { exact: true }).fill('726491');
  await button(page, 'Enregistrer mon code').click();
  await button(page, 'Activer le déverrouillage avec le téléphone').click();
  await heading(page, 'Ouvre l’app en un geste').waitFor({ state: 'hidden' });
  const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  assert.equal(credentials.length, 1);
  assert.ok(await stored(page, 'boussole-lock-v1'));
});

test('la proposition du verrou peut être remise à plus tard', async (t) => {
  const copy = { otp: [], keyRequests: 0, password: 'un mot de passe long' };
  const page = await device(t, copy);
  await withAuthenticator(page);
  await page.goto('/dashboard');
  await signIn(page, copy.password);
  await firstBudget(page);
  await heading(page, 'Ouvre l’app en un geste').waitFor();
  await button(page, 'Plus tard').click();
  await heading(page, 'Ton premier budget').waitFor();
  assert.equal(await stored(page, 'boussole-lock-v1'), null);
});
