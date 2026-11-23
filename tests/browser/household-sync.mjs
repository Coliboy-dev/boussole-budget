// Utilise la même valeur de NEXT_PUBLIC_HOUSEHOLD_ENABLED au build et au lancement de la recette.
// Lance le build avec l’URL et la clé publique de Supabase local, ainsi qu’un secret serveur de test.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { ACCOUNT_OWNER_KEY, AUTH_STORAGE_KEY } from '../../lib/account-guard.ts';
import { BUDGET_STORAGE_KEY, deserializeStoredBudget, emptyBudgetState, serializeBudget } from '../../lib/budget-state.ts';
import { createInvitationToken } from '../../lib/household-invitations.ts';
import { encodeHouseholdWrites } from '../../lib/household-sync.ts';
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
  let deleted = false;
  t.after(async () => {
    await browser.close();
    if (!deleted) success(await admin.auth.admin.deleteUser(user.id));
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
    return { api, context, page, deleteAccount: async () => {
      success(await api.rpc('delete_my_account'));
      deleted = true;
    } };
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

test('Versement du foyer · projection, réception et une seule ligne dans le Personnel', { timeout: 120000, skip: !householdEnabled }, async (t) => {
  const openDevice = await householdFixture(t);
  const { page } = await openDevice(privateContents);
  async function checkAccessibility() {
    await page.evaluate(axeSource);
    const audit = await page.evaluate(() => window.axe.run({ runOnly: {
      type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
    } }));
    assert.deepEqual(audit.violations.map(({ id }) => id), []);
  }
  await page.goto('/dashboard');
  await balance(page, 777).waitFor();
  await button(page, 'Notre foyer').click();
  await button(page, 'Créer mon foyer').click();
  await page.waitForURL('**/dashboard');

  await button(page, 'Modifier le solde bancaire').click();
  await page.getByLabel('Solde bancaire actuel').fill('500');
  await button(page, 'OK').click();
  await balance(page, 500).waitFor();
  await page.goto('/foyer');
  await page.getByLabel('Montant du versement (€)').waitFor();
  await checkAccessibility();
  await page.getByLabel('Montant du versement (€)').fill('300');
  await page.getByLabel('Première date prévue').fill(todayInBrussels());
  await page.getByRole('region', { name: 'Mon versement' }).getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Versement enregistré.', { exact: true }).waitFor();

  await page.goto('/dashboard');
  await page.getByRole('heading', { name: 'Disponible confirmé', exact: true }).waitFor();
  await page.getByText('Avec les versements attendus', { exact: true }).waitFor();
  await button(page, 'Marquer comme reçu').first().click();
  await balance(page, 800).waitFor();
  await page.goto('/foyer/mouvements');
  await page.getByText('Reçu', { exact: true }).waitFor();
  await checkAccessibility();

  await button(page, 'Personnel').click();
  await page.goto('/charges');
  await page.getByText('Versement au compte commun', { exact: true }).waitFor();
  assert.equal(await page.getByText('Versement au compte commun', { exact: true }).count(), 1);
  await page.reload();
  await page.getByText('Versement au compte commun', { exact: true }).waitFor();
  assert.equal(await page.getByText('Versement au compte commun', { exact: true }).count(), 1);
});

test('Versement du partenaire · accord explicite, mise à jour et clôture de la ligne miroir', { timeout: 120000, skip: !householdEnabled }, async (t) => {
  const openOwner = await householdFixture(t);
  const openPartner = await householdFixture(t);
  const owner = await openOwner(privateContents);
  const partner = await openPartner();
  const { page } = owner;
  const [{ household_id: householdId, member_id: memberId }] = success(await owner.api.rpc('create_household'));
  const { token, tokenHash } = await createInvitationToken();
  const invitation = success(await owner.api.rpc('create_invitation', { h: householdId, token_hash: tokenHash }));
  success(await partner.api.rpc('accept_invitation', { invitation, token }));
  const { session } = success(await partner.api.auth.getSession());
  const response = await fetch(new URL('/api/household-key', baseURL), {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ householdId }),
  });
  assert.equal(response.status, 200);
  const { material } = await response.json();
  const key = await crypto.subtle.importKey('raw', Buffer.from(material, 'base64'), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const id = `contribution|${memberId}`;
  const date = todayInBrussels();
  async function publish(amountCents) {
    const record = { kind: 'income', id };
    if (amountCents !== undefined) record.data = {
      id, label: 'Versement au compte commun', type: 'household_contribution', contributionMemberId: memberId,
      amount: amountCents, frequency: 'monthly', expectedDate: date, isConfirmed: false,
    };
    const records = await encodeHouseholdWrites(key, { householdId, keyVersion: 1 }, [record]);
    success(await partner.api.rpc('upsert_records', { h: householdId, records }));
  }
  async function mirrors() {
    const contents = await page.evaluate(storageKey => localStorage.getItem(storageKey), BUDGET_STORAGE_KEY);
    return deserializeStoredBudget(contents).budget.expenses.filter(({ category }) => category === 'household');
  }

  await publish(60000);
  await page.goto('/foyer');
  await button(page, 'Ouvrir le foyer').click();
  await page.waitForURL('**/dashboard');
  const card = page.getByRole('complementary', { name: 'Versement dans ton budget personnel' });
  await card.getByText(/600,00/).waitFor();
  await page.evaluate(axeSource);
  const audit = await card.evaluate((element) => window.axe.run(element, { runOnly: {
    type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
  } }));
  assert.deepEqual(audit.violations.map(({ id }) => id), []);
  assert.deepEqual(await mirrors(), []);
  await button(card, 'Pas maintenant').click();
  await card.waitFor({ state: 'hidden' });
  assert.deepEqual(await mirrors(), []);

  await publish(70000);
  await page.reload();
  await card.getByText(/700,00/).waitFor();
  await button(card, 'Ajouter').click();
  await waitFor(async () => assert.deepEqual((await mirrors()).map(({ amount }) => amount), [700]));

  await publish(85000);
  await page.reload();
  await card.getByText(/850,00/).waitFor();
  assert.deepEqual((await mirrors()).map(({ amount }) => amount), [700]);
  await button(card, 'Mettre à jour').click();
  await waitFor(async () => assert.deepEqual((await mirrors()).map(({ amount }) => amount), [850]));

  await publish();
  await page.reload();
  await waitFor(async () => {
    const [mirror] = await mirrors();
    assert.equal(mirror?.endDate, date);
    assert.equal(mirror.isRecurring, false);
  });
});

test('F-B · avance et transfert avec deux comptes, historique sur un appareil neuf et foyer sans compte commun', { timeout: 120000, skip: !householdEnabled }, async (t) => {
  const openMarc = await householdFixture(t);
  const openSam = await householdFixture(t);
  const marc = await openMarc(privateContents);
  const sam = await openSam(privateContents);
  const [{ household_id: h }] = success(await marc.api.rpc('create_household'));
  const { token, tokenHash } = await createInvitationToken();
  const invitation = success(await marc.api.rpc('create_invitation', { h, token_hash: tokenHash }));
  success(await sam.api.rpc('accept_invitation', { invitation, token }));

  async function selectHousehold({ page }) {
    await page.goto('/foyer');
    await button(page, 'Ouvrir le foyer').click();
    await page.waitForURL('**/dashboard');
    await page.getByRole('heading', { name: 'Aujourd’hui' }).waitFor();
  }
  async function personalBudget(page) {
    const contents = await page.evaluate(key => localStorage.getItem(key), BUDGET_STORAGE_KEY);
    return deserializeStoredBudget(contents).budget;
  }

  await selectHousehold(marc);
  await button(marc.page, 'Modifier le solde bancaire').click();
  await marc.page.getByLabel('Solde bancaire actuel').fill('500');
  await button(marc.page, 'OK').click();
  await balance(marc.page, 500).waitFor();
  await button(marc.page, 'Ajouter une dépense').click();
  await marc.page.getByLabel('Saisie rapide').fill('40 Colruyt');
  await marc.page.getByRole('checkbox', { name: 'Payé avec mon argent personnel' }).check();
  await button(marc.page, 'Ajouter la dépense').click();
  await waitFor(async () => assert.equal((await personalBudget(marc.page)).currentBalance, 737));
  await balance(marc.page, 500).waitFor();

  await marc.page.goto('/foyer/mouvements');
  await button(marc.page, 'Déclarer un transfert').click();
  await marc.page.getByLabel('Montant du transfert (€)').fill('50');
  await button(marc.page, 'Enregistrer').click();
  await marc.page.getByText(/À confirmer/).waitFor();
  await waitFor(async () => assert.equal((await personalBudget(marc.page)).currentBalance, 687));
  assert.equal(await button(marc.page, 'Confirmer la réception').count(), 0);

  await selectHousehold(sam);
  await sam.page.goto('/foyer/mouvements');
  await sam.page.getByText(/À confirmer/).waitFor();
  assert.equal((await personalBudget(sam.page)).currentBalance, 777);
  await button(sam.page, 'Confirmer la réception').click();
  await sam.page.getByText(/Confirmé par Toi/).waitFor();
  await waitFor(async () => {
    const budget = await personalBudget(sam.page);
    assert.equal(budget.currentBalance, 827);
    assert.equal(budget.incomes.filter(({ type }) => type === 'household_transfer').length, 1);
  });
  await sam.page.reload();
  await sam.page.getByText(/Confirmé par Toi/).waitFor();
  assert.equal((await personalBudget(sam.page)).currentBalance, 827);
  await sam.page.evaluate(axeSource);
  const audit = await sam.page.evaluate(() => window.axe.run({ runOnly: {
    type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
  } }));
  assert.deepEqual(audit.violations.map(({ id }) => id), []);

  await sam.deleteAccount();
  const freshMarc = await openMarc(privateContents);
  await selectHousehold(freshMarc);
  await freshMarc.page.goto('/foyer/mouvements');
  await freshMarc.page.getByText(/Confirmé par Ancien membre/).waitFor();

  await freshMarc.page.goto('/foyer');
  await freshMarc.page.getByRole('checkbox', { name: 'Nous n’avons pas de compte commun' }).click();
  await freshMarc.page.getByRole('region', { name: 'Mon versement' }).waitFor({ state: 'hidden' });
  await freshMarc.page.goto('/dashboard');
  await freshMarc.page.getByText('Ce foyer fonctionne sans compte commun.').waitFor();
  assert.equal(await freshMarc.page.getByRole('heading', { name: 'Disponible confirmé' }).count(), 0);
  assert.equal(await freshMarc.page.getByRole('link', { name: 'Échéances' }).count(), 0);
  await button(freshMarc.page, 'Ajouter une dépense').click();
  const paidFrom = freshMarc.page.getByRole('checkbox', { name: 'Payé avec mon argent personnel' });
  assert.equal(await paidFrom.isChecked(), true);
  assert.equal(await paidFrom.isDisabled(), true);
});
