// Lancer avec Node 22 et Playwright disponible localement ou via NODE_PATH.
// BOUSSOLE_TEST_URL=http://localhost:3000 node --test tests/browser/lock-webauthn.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

const { chromium } = createRequire(import.meta.url)('playwright');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
const pin = '684219';
const fallbackMessage = "Le téléphone n'a pas confirmé. Entre ton code Capiste.";
let browser;

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.BOUSSOLE_CHROMIUM_PATH });
});
after(async () => { await browser?.close(); });

async function fixture(t) {
  const context = await browser.newContext({
    baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    locale: 'fr-BE', serviceWorkers: 'block',
  });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  await page.addInitScript(() => {
    window.phoneRequests = [];
    const nativeGet = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = (options) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      const request = { controller, signal: options.signal };
      window.phoneRequests.push(request);
      if (options.signal?.aborted) abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      return nativeGet({ ...options, signal: controller.signal })
        .finally(() => options.signal?.removeEventListener('abort', abort));
    };
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true,
    },
  });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const locked = page.getByRole('heading', { name: 'Capiste est verrouillé' });
  const settings = page.getByRole('heading', { name: 'Compte et sécurité' });

  await page.goto('/synchronisation');
  await button('Activer le verrouillage').click();
  await page.locator('#lock-new').fill(pin);
  await page.locator('#lock-confirm').fill(pin);
  await button('Activer').click();
  await button('Activer le déverrouillage avec le téléphone').click();
  await page.locator('#phone-pin').fill(pin);
  await button('Confirmer le code').click();
  await button('Continuer sur mon téléphone').click();
  await page.getByText('Méthode du téléphone activée.', { exact: true }).waitFor();

  return {
    context, page, button, locked, settings,
    presence: (enabled) => cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled }),
    count: () => page.evaluate(() => window.phoneRequests.length),
    waitForCount: (count) => page.waitForFunction((n) => window.phoneRequests.length >= n, count),
  };
}

test('Le verrou demande WebAuthn au lancement, sans appui dans Capiste', async (t) => {
  const { page, settings, locked, button, count, waitForCount } = await fixture(t);
  await page.reload();
  await waitForCount(1);
  await settings.waitFor();
  assert.equal(await count(), 1);
  await button('Verrouiller maintenant').click();
  await locked.waitFor();
  await button('Se déverrouiller').waitFor();
  assert.equal(await count(), 1);
});

test('Annuler affiche le code avec le focus et sans nouvelle demande automatique', async (t) => {
  const { page, locked, button, presence, count, waitForCount } = await fixture(t);
  await presence(false);
  await page.reload();
  await locked.waitFor();
  await waitForCount(1);
  assert.equal(await page.locator('#lock-pin').count(), 0);
  await page.evaluate(() => window.phoneRequests[0].controller.abort());
  await page.getByText(fallbackMessage, { exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'lock-pin');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
  });
  await locked.waitFor();
  assert.equal(await count(), 1);
  // Une demande explicite reste possible si le navigateur a exigé un geste au départ.
  await button('Se déverrouiller').click();
  await waitForCount(2);
  assert.equal(await count(), 2);
});

test('Une absence annule la demande et le retour du verrou la relance une seule fois', async (t) => {
  const { page, locked, settings, button, presence, count, waitForCount } = await fixture(t);
  await presence(false);
  await page.reload();
  await waitForCount(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
  });
  assert.equal(await page.evaluate(() => window.phoneRequests[0].signal?.aborted), true);
  assert.equal(await settings.count(), 0);
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('focus'));
  });
  await waitForCount(2);
  await locked.waitFor();
  assert.equal(await count(), 2);
  await button('Utiliser mon code Capiste').click();
  await page.waitForFunction(() => document.activeElement?.id === 'lock-pin');
  assert.equal(await page.evaluate(() => window.phoneRequests[1].signal?.aborted), true);
  assert.equal(await count(), 2);
  await page.locator('#lock-pin').fill(pin);
  await button('Déverrouiller').click();
  await settings.waitFor();
});

test('Un verrouillage dans un autre onglet annule la demande en cours', async (t) => {
  const { context, page, locked, presence, count, waitForCount } = await fixture(t);
  const other = await context.newPage();
  await other.goto('/synchronisation');
  await page.bringToFront();
  await presence(false);
  await page.reload();
  await waitForCount(1);
  await other.evaluate(() => {
    const channel = new BroadcastChannel('boussole-security');
    channel.postMessage({ type: 'locked', at: Date.now(), source: 'second-onglet' });
    channel.close();
  });
  await page.getByText(fallbackMessage, { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.phoneRequests[0].signal?.aborted), true);
  await locked.waitFor();
  assert.equal(await count(), 1);
});

test('Si WebAuthn est indisponible, le PIN reste accessible sans demande au téléphone', async (t) => {
  const { page, button, count } = await fixture(t);
  await page.addInitScript(() => {
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => false;
  });
  await page.reload();
  await page.locator('#lock-pin').waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'lock-pin');
  assert.equal(await button('Se déverrouiller').count(), 0);
  assert.equal(await count(), 0);
});
