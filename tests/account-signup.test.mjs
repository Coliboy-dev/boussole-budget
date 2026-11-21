import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generatePassphrase } from '../lib/passphrase.ts';
import { readPendingVault, PENDING_VAULT_KEY, matchesInitialVault } from '../lib/vault-pending.ts';
import { readExpiredSession } from '../lib/account-guard.ts';
import { eraseLocalData } from '../lib/account-lifecycle.ts';
import { BUDGET_STORAGE_KEY } from '../lib/budget-state.ts';

test('C1 — la phrase utilise quatre groupes et rejette les octets à partir de 248', () => {
  let offsets = 0;
  const phrase = generatePassphrase((bytes) => {
    for (let i = 0; i < bytes.length; i++) bytes[i] = [248, 255, 247, 0, 1][offsets++ % 5];
    return bytes;
  });
  assert.equal(phrase, '9AB9A-B9AB9-AB9AB-9AB9A');
  assert.ok(offsets > 20);
});

test('C1 — un marqueur de création illisible reste distinct d’une création terminée', () => {
  const marker = { userId: 'a', fingerprint: 'empreinte-initiale' };
  const storage = (value) => ({ getItem: (key) => key === PENDING_VAULT_KEY ? value : null });
  assert.equal(readPendingVault(storage(null)), null);
  assert.equal(readPendingVault(storage('!')), 'unreadable');
  assert.deepEqual(readPendingVault(storage(JSON.stringify(marker))), marker);
  assert.equal(matchesInitialVault('empreinte-initiale', 'nouvelle-empreinte', marker), true);
  assert.equal(matchesInitialVault('nouvelle-empreinte', 'nouvelle-empreinte', marker), true);
  assert.equal(matchesInitialVault('copie-concurrente', 'nouvelle-empreinte', marker), false);
});

test('C1 — seule une session locale complète et expirée peut servir au démarrage hors ligne', () => {
  const session = { access_token: 'jeton', refresh_token: 'renouvellement', user: { id: 'a', email: 'a@example.org' }, expires_at: 12 };
  const storage = (entry) => ({ getItem: () => JSON.stringify(entry) });
  assert.deepEqual(readExpiredSession(storage(session), 12), { userId: 'a', email: 'a@example.org' });
  assert.equal(readExpiredSession(storage(session), 11), null);
  assert.equal(readExpiredSession(storage({ ...session, refresh_token: '' }), 13), null);
  assert.equal(readExpiredSession(storage({ ...session, expires_at: undefined }), 13), null);
});

test('C1 — le marqueur survit si le budget résiste à un effacement confirmé', async () => {
  const marker = JSON.stringify({ userId: 'a', fingerprint: 'empreinte-initiale' });
  const entries = new Map([[BUDGET_STORAGE_KEY, 'budget de test'], [PENDING_VAULT_KEY, marker]]);
  const result = await eraseLocalData({
    storage: {
      getItem: (key) => entries.get(key) ?? null,
      removeItem: (key) => { if (key !== BUDGET_STORAGE_KEY) entries.delete(key); },
    },
    deleteKeyStore: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(entries.get(PENDING_VAULT_KEY), marker);
});
