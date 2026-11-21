import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACCOUNT_OWNER_KEY, accountGuard, isPristineBudget, readBudgetOwner, readStoredSessionUserId,
} from '../lib/account-guard.ts';
import { eraseLocalData, LOCAL_STORAGE_KEYS } from '../lib/account-lifecycle.ts';
import { BUDGET_STORAGE_KEY, emptyBudgetState, LEGACY_BUDGET_STORAGE_KEY, serializeBudget } from '../lib/budget-state.ts';
import { SYNC_MEMORY_KEY } from '../lib/cloud-sync.ts';

const guest = { type: 'guest' };
const ownerA = { type: 'account', userId: 'a' };
const storage = (entries = {}) => ({ getItem: (key) => entries[key] ?? null });

test('C0 — seul le compte propriétaire avec sa propre clé ouvre le budget associé', () => {
  const access = (sessionUserId, keyUserId, owner = ownerA) => accountGuard({ sessionUserId, keyUserId, owner });
  assert.equal(access('a', 'a'), true);
  for (const [session, key] of [[null, null], [undefined, 'a'], ['a', null], ['b', 'a'], ['b', 'b'], ['a', 'b']]) {
    assert.equal(access(session, key), false);
  }
  assert.equal(access(null, null, guest), true);
  assert.equal(access('b', 'b', guest), false);
  assert.equal(access(undefined, null, guest), false);
  assert.equal(access('a', 'a', { type: 'transition', userId: 'a' }), false);
  assert.equal(access(null, null, { type: 'unreadable' }), false);
});

test('C0 — seule la clé de propriétaire établit le rattachement du budget', () => {
  const previous = JSON.stringify({ userId: 'a', version: 2, fingerprint: 'une ancienne empreinte' });
  const linked = JSON.stringify(ownerA);
  // La production est vide avant C0. Une ancienne mémoire peut désigner un compte de test disparu.
  assert.deepEqual(readBudgetOwner(storage({ [SYNC_MEMORY_KEY]: previous })), guest);
  assert.deepEqual(readBudgetOwner(storage()), guest);
  assert.deepEqual(readBudgetOwner(storage({ [ACCOUNT_OWNER_KEY]: linked, [SYNC_MEMORY_KEY]: '!' })), ownerA);
  assert.deepEqual(readBudgetOwner(storage({ [ACCOUNT_OWNER_KEY]: '!', [SYNC_MEMORY_KEY]: previous })), { type: 'unreadable' });
  assert.deepEqual(readBudgetOwner(storage({ [SYNC_MEMORY_KEY]: '!' })), guest);
  assert.ok(LOCAL_STORAGE_KEYS.includes(ACCOUNT_OWNER_KEY));
});

test('C0 — une session absente est distincte d’une session illisible', () => {
  assert.equal(readStoredSessionUserId(storage()), null);
  assert.equal(readStoredSessionUserId(storage({ 'boussole-auth': '!' })), undefined);
  assert.equal(readStoredSessionUserId(storage({
    'boussole-auth': JSON.stringify({ access_token: 'session-de-test', user: { id: 'b' } }),
  })), 'b');
});

test('C0 — un effacement partiel conserve le propriétaire du budget restant', async () => {
  const entries = new Map([
    [BUDGET_STORAGE_KEY, serializeBudget(emptyBudgetState)],
    [ACCOUNT_OWNER_KEY, JSON.stringify(ownerA)],
  ]);
  const result = await eraseLocalData({
    storage: {
      getItem: (key) => entries.get(key) ?? null,
      removeItem: (key) => { if (key !== BUDGET_STORAGE_KEY) entries.delete(key); },
    },
    deleteKeyStore: async () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(entries.get(ACCOUNT_OWNER_KEY), JSON.stringify(ownerA));
});

test('C0 — le prénom, la médiation, les documents et la sauvegarde historique comptent', () => {
  assert.equal(isPristineBudget(serializeBudget(emptyBudgetState), null), true);
  assert.equal(isPristineBudget(serializeBudget(emptyBudgetState), storage({ [LEGACY_BUDGET_STORAGE_KEY]: '{}' })
    .getItem(LEGACY_BUDGET_STORAGE_KEY)), false);
  for (const state of [
    { ...emptyBudgetState, userProfile: { ...emptyBudgetState.userProfile, firstName: 'Lou' } },
    { ...emptyBudgetState, mediationFile: { ...emptyBudgetState.mediationFile, questionsForMediator: ['Une question'] } },
    { ...emptyBudgetState, documents: [{ id: 'note', label: 'Note', category: 'other', date: '2026-11-21', isConfidential: true }] },
  ]) {
    assert.equal(isPristineBudget(serializeBudget(state), null), false);
  }
});
