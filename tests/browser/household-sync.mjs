// Utilise la même valeur de NEXT_PUBLIC_HOUSEHOLD_ENABLED au build et au lancement de la recette.
// Lance le build avec l’URL et la clé publique de Supabase local, ainsi qu’un secret serveur de test.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { ACCOUNT_OWNER_KEY, AUTH_STORAGE_KEY } from '../../lib/account-guard.ts';
import { BUDGET_STORAGE_KEY, emptyBudgetState, serializeBudget } from '../../lib/budget-state.ts';
import { todayInBrussels } from '../../lib/local-date.ts';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { source: axeSource } = require('axe-core');
const url = new URL(process.env.SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321');
const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://127.0.0.1:3000';
const publicKey = process.env.SUPABASE_LOCAL_PUBLISHABLE_KEY;
const adminKey = process.env.SUPABASE_LOCAL_SECRET_KEY;
const loopback = ['127.0.0.1', 'localhost', '[::1]'];
assert.ok(loopback.includes(url.hostname) && loopback.includes(new URL(baseURL).hostname) && publicKey && adminKey);
const auth = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
const client = key => createClient(url.origin, key, { auth });
const requestTimeout = 25000;
const householdEnabled = process.env.NEXT_PUBLIC_HOUSEHOLD_ENABLED === 'true';
const privateContents = serializeBudget({ ...emptyBudgetState, currentBalance: 777, balanceDate: todayInBrussels() });

function success({ data, error }) {
  assert.equal(error, null, error?.message);
  return data;
}

function button(page, name) { return page.getByRole('button', { name, exact: true }); }
function balance(page, amount) {
  return page.locator('span.tabular-nums').filter({ hasText: new RegExp(`^${amount},00[\\s  ]€$`) });
}

async function waitFor(assertion) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { return await assertion(); } catch (error) { lastError = error; }
    await setTimeout(250);
  }
  throw lastError;
}

async function trackSpending(page, entry) {
  await button(page, 'Ajouter une dépense').click();
  await page.getByLabel('Saisie rapide').fill(entry);
  await button(page, 'Ajouter la dépense').click();
}

async function householdFixture(t) {
  const admin = client(adminKey);
  const email = `foyer-web-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('hex');
  const { user } = success(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  const browser = await chromium.launch({ executablePath: process.env.BOUSSOLE_CHROMIUM_PATH ?? '/usr/bin/chromium' });
  t.after(async () => {
    await browser.close();
    success(await admin.auth.admin.deleteUser(user.id));
  });

  async function openDevice(personalBudget, previousHousehold = null) {
    const api = client(publicKey);
    const { session } = success(await api.auth.signInWithPassword({ email, password }));
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(requestTimeout);
    await page.goto('/robots.txt');
    await page.evaluate(async ({ session, personalBudget, previousHousehold, authKey, ownerKey, budgetKey }) => {
      localStorage.setItem(ownerKey, JSON.stringify(personalBudget ? { type: 'account', userId: session.user.id } : { type: 'guest' }));
      localStorage.setItem(authKey, JSON.stringify(session));
      if (!personalBudget) return;
      localStorage.setItem(budgetKey, personalBudget);
      const key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(19), 'AES-GCM', false, ['encrypt', 'decrypt']);
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('boussole-cloud', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('keys');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('keys', 'readwrite');
          const store = transaction.objectStore('keys');
          store.put({
            userId: session.user.id, key, keyMode: 'legacy', salt: 'sel-fictif-appareil', kdfIterations: 600000,
          }, 'budget');
          if (previousHousehold) {
            store.put({
              selected: previousHousehold,
              households: [{ id: previousHousehold, createdAt: '2026-11-22T00:00:00Z', keyVersion: 1 }],
            }, `household-directory:${session.user.id}`);
          }
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onabort = () => { db.close(); reject(transaction.error); };
        };
      });
    }, { session, personalBudget, previousHousehold, authKey: AUTH_STORAGE_KEY, ownerKey: ACCOUNT_OWNER_KEY, budgetKey: BUDGET_STORAGE_KEY });
    return { api, context, page };
  }

  return openDevice;
}

test('Foyer désactivé · le budget personnel et sa protection restent actifs', { skip: householdEnabled }, async (t) => {
  const openDevice = await householdFixture(t);
  const { page } = await openDevice(privateContents, randomUUID());
  const householdRequests = [];
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    if (/\/api\/household-key|\/rest\/v1\/(households|household_|rpc\/(household_|create_household|pull_records|upsert_records))/.test(pathname)) {
      householdRequests.push(pathname);
    }
  });
  await page.goto('/dashboard');
  await balance(page, 777).waitFor();
  assert.equal(await page.getByRole('group', { name: 'Espace budgétaire' }).count(), 0);

  await page.getByRole('link', { name: 'Plus', exact: true }).click();
  await page.getByRole('heading', { name: 'Plus', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Notre foyer', exact: true }).count(), 0);

  await page.goto('/foyer');
  await page.getByText('Bientôt disponible', { exact: true }).waitFor();
  assert.equal(await button(page, 'Créer mon foyer').count(), 0);
  assert.deepEqual(householdRequests, []);

  const unlinked = await openDevice();
  await unlinked.page.goto('/dashboard');
  await unlinked.page.getByRole('heading', { name: 'Compte et sécurité', exact: true }).waitFor();
  assert.equal(await balance(unlinked.page, 777).count(), 0);
});

test('Foyer à un membre · synchronisation et reprise hors ligne sur deux appareils', { timeout: 120000, skip: !householdEnabled }, async (t) => {
  const openDevice = await householdFixture(t);
  const first = await openDevice(privateContents);
  await first.page.goto('/dashboard');
  await balance(first.page, 777).waitFor();
  await button(first.page, 'Notre foyer').click();
  await button(first.page, 'Créer mon foyer').click();
  await first.page.waitForURL('**/dashboard');

  await button(first.page, 'Modifier le solde bancaire').click();
  await first.page.getByLabel('Solde bancaire actuel').fill('500');
  await button(first.page, 'OK').click();
  await balance(first.page, 500).waitFor();
  const household = await waitFor(async () => {
    const [row] = success(await first.api.from('households').select('id,last_seq'));
    assert.equal(row?.last_seq, 1);
    return row;
  });
  await first.page.waitForFunction(() => !!navigator.serviceWorker.controller);

  await first.context.setOffline(true);
  await trackSpending(first.page, '65 Colruyt');
  await balance(first.page, 435).waitFor();
  assert.equal(success(await first.api.from('households').select('last_seq'))[0].last_seq, 1);

  await first.page.reload();
  await balance(first.page, 435).waitFor();
  assert.equal(await first.page.evaluate(key => localStorage.getItem(key), BUDGET_STORAGE_KEY), privateContents);
  await first.context.setOffline(false);
  await waitFor(async () => {
    assert.equal(success(await first.api.from('households').select('last_seq').eq('id', household.id))[0].last_seq, 3);
  });

  const second = await openDevice();
  await second.page.goto('/dashboard');
  await second.page.getByRole('link', { name: 'Notre foyer', exact: true }).click();
  await button(second.page, 'Ouvrir le foyer').waitFor();
  await second.page.evaluate(axeSource);
  const a11y = await second.page.evaluate(() => window.axe.run({ runOnly: {
    type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
  } }));
  assert.deepEqual(a11y.violations.map(({ id, nodes }) => ({ id, elements: nodes.map(({ target }) => target) })), []);
  await button(second.page, 'Ouvrir le foyer').click();
  await balance(second.page, 435).waitFor();
  assert.equal(await second.page.evaluate(key => localStorage.getItem(key), BUDGET_STORAGE_KEY), null);

  await Promise.all([first.context.setOffline(true), second.context.setOffline(true)]);
  await Promise.all([trackSpending(first.page, '10 Colruyt'), trackSpending(second.page, '20 Colruyt')]);
  await Promise.all([balance(first.page, 425).waitFor(), balance(second.page, 415).waitFor()]);
  await Promise.all([first.context.setOffline(false), second.context.setOffline(false)]);
  await waitFor(async () => {
    assert.equal(success(await first.api.from('households').select('last_seq').eq('id', household.id))[0].last_seq, 5);
  });
  for (const page of [first.page, second.page]) {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await balance(page, 405).waitFor();
  }
  await button(first.page, 'Personnel').click();
  await balance(first.page, 777).waitFor();

  const tab = await second.context.newPage();
  await tab.goto('/robots.txt');
  await tab.evaluate(key => localStorage.removeItem(key), AUTH_STORAGE_KEY);
  await balance(second.page, 405).waitFor({ state: 'hidden' });
});
