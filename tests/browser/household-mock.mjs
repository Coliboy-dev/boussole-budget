// Serveur Supabase et route de clé simulés pour les parcours du Foyer (PR 5a et 5b).
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { after, before } from 'node:test';
import { emptyBudgetState, serializeBudget } from '../../lib/budget-state.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
export const baseURL = process.env.BOUSSOLE_TEST_URL ?? 'http://localhost:3000';
export const origin = 'https://c0-test.supabase.test';
export const A = '11111111-1111-4111-8111-111111111111';
export const B = '22222222-2222-4222-8222-222222222222';
export const H = '33333333-3333-4333-8333-333333333333';
export const mA = '44444444-4444-4444-8444-444444444444';
export const mB = '55555555-5555-4555-8555-555555555555';
export const INVITATION = '66666666-6666-4666-8666-666666666666';
export const localBudget = serializeBudget({ ...emptyBudgetState, currentBalance: 800, balanceDate: '2026-11-21' });

export let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.BOUSSOLE_CHROMIUM_PATH }); });
after(async () => { await browser?.close(); });

export function session(userId) {
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600 })).toString('base64url');
  return {
    access_token: ['eyJhbGciOiJIUzI1NiJ9', claims, 'fictif'].join('.'),
    refresh_token: 'refresh-fictif', token_type: 'bearer', expires_at: now + 3600, expires_in: 3600,
    user: { id: userId, email: userId === A ? 'a@example.test' : 'b@example.test', aud: 'authenticated' },
  };
}

/** Serveur simulé : l'état des adhésions évolue avec les RPC, comme les fonctions SQL de la PR 1. */
export async function fixture(t, userId, members) {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  // pullRefused : le serveur refuse lectures et écritures alors que la liste peut encore dire « membre » (ordre forcé).
  const server = { members: new Map(members), calls: [], invitation: null, seq: 0, pullRefused: false, records: new Map() };
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
        // Comme pull_records : les éléments après le curseur, sans identifiant de compte.
        return route.fulfill({ json: [...server.records.values()].filter(({ seq }) => seq > body.after_seq).sort((a, b) => a.seq - b.seq) });
      case 'upsert_records':
        if (!active || server.pullRefused) return route.fulfill({ status: 403, json: { code: '42501', message: 'Ce foyer est indisponible.' } });
        return route.fulfill({ json: body.records.map((record) => {
          const previous = server.records.get(record.record_id);
          const stored = {
            household_id: H, record_id: record.record_id, seq: ++server.seq, key_version: record.key_version,
            ciphertext: record.ciphertext, iv: record.iv, deleted: record.deleted, updated_at: new Date().toISOString(),
            author_member_id: previous?.author_member_id ?? own(), editor_member_id: own(),
            exclusive: previous?.exclusive ?? record.exclusive === true,
          };
          server.records.set(record.record_id, stored);
          return { record_id: stored.record_id, seq: stored.seq };
        }) });
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

export function idb(page, id) {
  return page.evaluate((entry) => new Promise((resolve, reject) => {
    const open = indexedDB.open('boussole-cloud', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = open.result.transaction('keys').objectStore('keys').get(entry);
      request.onsuccess = () => {
        const value = request.result;
        open.result.close();
        resolve(value ? { ...value, key: value.key ? 'CryptoKey' : undefined, keyExtractable: value.key?.extractable } : null);
      };
      request.onerror = () => reject(request.error);
    };
  }), id);
}

export async function waitForEntry(page, id, property) {
  const ready = await page.waitForFunction(({ entry, field }) => new Promise((resolve, reject) => {
    const open = indexedDB.open('boussole-cloud', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction('keys').objectStore('keys').get(entry);
      request.onsuccess = () => {
        const value = request.result?.[field];
        db.close();
        const present = Array.isArray(value) ? value.length > 0 : Boolean(value);
        resolve(present && (field !== 'confirmed' || request.result.pending.length === 0));
      };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }), { entry: id, field: property });
  await ready.dispose();
}

export async function holdDirectoryUpdate(page, userId) {
  await page.evaluate((directoryKey) => {
    const get = IDBObjectStore.prototype.get;
    const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    let holding = false;
    const callbacks = [];

    IDBObjectStore.prototype.get = function (key) {
      const request = get.call(this, key);
      if (key === directoryKey && (holding || this.transaction.mode === 'readonly')) {
        holding = true;
        const transaction = this.transaction;
        Object.defineProperty(transaction, 'oncomplete', {
          set(callback) {
            complete.set.call(transaction, (event) => callbacks.push(() => callback.call(transaction, event)));
          },
        });
      }
      return request;
    };

    window.releaseHouseholdDirectory = () => {
      IDBObjectStore.prototype.get = get;
      for (const completeRead of callbacks) completeRead();
    };
    window.householdDirectoryHeld = () => callbacks.length > 0;
  }, `household-directory:${userId}`);
}

/** Déclenche « online » et « visible » puis attend que l'annuaire ait réellement interrogé le serveur. Aucune temporisation. */
export async function nudge(page, times) {
  for (let index = 0; index < times; index++) {
    const listed = page.waitForResponse((response) => response.url().endsWith('/rpc/list_my_households'));
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await listed;
  }
}

export const syncCalls = (server) => server.calls.filter(({ rpc }) => rpc === 'pull_records' || rpc === 'upsert_records').length;

export const button = (page, name) => page.getByRole('button', { name, exact: true });

export async function openHousehold(page) {
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
