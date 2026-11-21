import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FIRST_RETRY_MS, LOCK_STORAGE_KEY, MAX_RETRY_MS, createLockConfig, isValidPin, pinMatches, readLockState,
  registerFailure, registerSuccess, retryDelayMs, sameBytes, shouldLock, writeLockConfig,
} from '../lib/app-lock.ts';
import { LOCAL_STORAGE_KEYS, eraseLocalData } from '../lib/account-lifecycle.ts';

// Itérations réduites pour la vitesse des tests ; l’application en utilise 200 000.
const FAST = 1_000;

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test('P5-A — le bon code est accepté, un autre est refusé', async () => {
  const config = await createLockConfig('482915', 0, FAST);
  assert.equal(await pinMatches(config, '482915'), true);
  assert.equal(await pinMatches(config, '482916'), false);
  assert.equal(await pinMatches(config, '48291'), false);
  assert.equal(await pinMatches(config, 'abcdef'), false);
});

test('P5-A — le code n’apparaît jamais dans l’enregistrement et deux sels donnent deux empreintes', async () => {
  const first = await createLockConfig('123456', 0, FAST);
  const second = await createLockConfig('123456', 0, FAST);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  const storage = memoryStorage();
  writeLockConfig(storage, first);
  assert.equal(storage.getItem(LOCK_STORAGE_KEY).includes('123456'), false);
  assert.deepEqual(readLockState(storage), { status: 'valid', config: first });
});

test('P5-A — seuls six chiffres forment un code', async () => {
  for (const pin of ['123456', '000000']) assert.equal(isValidPin(pin), true);
  for (const pin of ['12345', '1234567', '12 456', '12345a', '']) assert.equal(isValidPin(pin), false);
  await assert.rejects(createLockConfig('1234', 0, FAST), /6 chiffres/);
});

test('P5-A — comparaison des empreintes', () => {
  assert.equal(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
  assert.equal(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])), false);
  assert.equal(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])), false);
});

test('P5-A — attente après échecs : 5 essais libres, 30 s, puis doublement plafonné à 15 min', () => {
  assert.deepEqual([1, 2, 3, 4].map(retryDelayMs), [0, 0, 0, 0]);
  assert.equal(retryDelayMs(5), FIRST_RETRY_MS);
  assert.equal(retryDelayMs(6), 60_000);
  assert.equal(retryDelayMs(7), 120_000);
  assert.equal(retryDelayMs(10), MAX_RETRY_MS);
  assert.equal(retryDelayMs(30), MAX_RETRY_MS);
});

test('P5-A — les échecs s’accumulent, survivent à une relecture et un succès remet à zéro', async () => {
  let config = await createLockConfig('111111', 0, FAST);
  const now = 1_000_000;
  for (let index = 0; index < 4; index++) config = registerFailure(config, now);
  assert.equal(config.retryAt, 0);
  config = registerFailure(config, now);
  assert.equal(config.failedAttempts, 5);
  assert.equal(config.retryAt, now + 30_000);
  config = registerFailure(config, now);
  assert.equal(config.retryAt, now + 60_000);

  const storage = memoryStorage();
  writeLockConfig(storage, config);
  const reread = readLockState(storage).config;
  assert.equal(reread.failedAttempts, 6);
  assert.equal(reread.retryAt, now + 60_000);

  assert.deepEqual(registerSuccess(reread), { ...reread, failedAttempts: 0, retryAt: 0 });
});

test('P5-A — verrouillage au retour selon le délai', () => {
  const hiddenAt = 1_000_000;
  assert.equal(shouldLock({ hiddenAt, now: hiddenAt + 1, delay: 0 }), true);
  assert.equal(shouldLock({ hiddenAt, now: hiddenAt + 59_000, delay: 60_000 }), false);
  assert.equal(shouldLock({ hiddenAt, now: hiddenAt + 60_000, delay: 60_000 }), true);
  assert.equal(shouldLock({ hiddenAt, now: hiddenAt + 61_000, delay: 60_000 }), true);
  assert.equal(shouldLock({ hiddenAt, now: hiddenAt + 299_000, delay: 300_000 }), false);
  assert.equal(shouldLock({ hiddenAt: null, now: hiddenAt, delay: 0 }), false);
});

test('P5-A — un réglage abîmé est « illisible », jamais « pas de verrou »', async () => {
  const valid = await createLockConfig('123456', 0, FAST);
  const unreadable = { status: 'unreadable' };
  assert.deepEqual(readLockState(memoryStorage()), { status: 'absent' });
  assert.deepEqual(readLockState(memoryStorage({ [LOCK_STORAGE_KEY]: '{oops' })), unreadable);
  assert.deepEqual(readLockState(memoryStorage({ [LOCK_STORAGE_KEY]: 'null' })), unreadable);
  assert.deepEqual(readLockState(memoryStorage({ [LOCK_STORAGE_KEY]: '' })), unreadable);
  for (const broken of [{ version: 1, delay: 42 }, { ...valid, hash: '' }, { ...valid, iterations: 0 }, { ...valid, delay: 1 }, { ...valid, version: 2 }]) {
    assert.deepEqual(readLockState(memoryStorage({ [LOCK_STORAGE_KEY]: JSON.stringify(broken) })), unreadable);
  }
  const throwing = { getItem: () => { throw new Error('stockage bloqué'); } };
  assert.deepEqual(readLockState(throwing), unreadable);
});

test('P5-A — l’effacement local supprime toutes les clés et le trousseau', async () => {
  const storage = memoryStorage(Object.fromEntries([...LOCAL_STORAGE_KEYS, 'autre-site'].map((key) => [key, 'x'])));
  let keyStoreDeleted = false;
  const result = await eraseLocalData({ storage, deleteKeyStore: async () => { keyStoreDeleted = true; } });
  assert.deepEqual(result, { ok: true, failed: [] });
  assert.equal(keyStoreDeleted, true);
  for (const key of LOCAL_STORAGE_KEYS) assert.equal(storage.getItem(key), null, key);
  assert.equal(storage.getItem('autre-site'), 'x');
});

test('P5-A — un effacement partiel n’est jamais annoncé comme réussi', async () => {
  const storage = memoryStorage({ 'boussole-budget-v2': 'budget' });
  const stubborn = { ...storage, removeItem: (key) => { if (key !== 'boussole-budget-v2') storage.removeItem(key); } };
  const result = await eraseLocalData({ storage: stubborn, deleteKeyStore: async () => { throw new Error('bloqué'); } });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failed, ['boussole-budget-v2', 'trousseau de chiffrement']);
});
