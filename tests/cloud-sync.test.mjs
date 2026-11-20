// Synchronisation chiffrée (P2-3) : chiffrement sur l’appareil et décisions de synchronisation.
// Lancer depuis la racine : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const lib = (path) => new URL(`../lib/${path}`, import.meta.url).href;
const {
  decryptText, deriveKey, encryptText, fingerprint, newSalt, passphraseProblem, WrongPassphraseError,
} = await import(lib('cloud-crypto.ts'));
const { decideSync, readSyncMemory, writeSyncMemory, clearSyncMemory, SYNC_MEMORY_KEY } = await import(lib('cloud-sync.ts'));
const { emptyBudgetState, serializeBudget, deserializeStoredBudget } = await import(lib('budget-state.ts'));

// Itérations minimales acceptées par la base, pour garder des tests rapides.
const FAST = 100_000;

const budget = {
  ...emptyBudgetState,
  currentBalance: 847.5,
  balanceDate: '2026-11-20',
  incomes: [{ id: 'i1', label: 'Indemnité mutuelle', type: 'mutual_insurance', amount: 1150, frequency: 'monthly',
    expectedDate: '2026-12-05', isConfirmed: true }],
  expenses: [{ id: 'e1', label: 'Loyer', category: 'rent', amount: 650, frequency: 'monthly', dueDate: '2026-12-01',
    isPaid: false, isRecurring: true }],
};

test('le budget chiffré se déchiffre à l’identique avec la bonne phrase secrète', async () => {
  const salt = newSalt();
  const plaintext = serializeBudget(budget);
  const encrypted = await encryptText(await deriveKey('une phrase bien longue', salt, FAST), plaintext);
  const decrypted = await decryptText(await deriveKey('une phrase bien longue', salt, FAST), encrypted);
  assert.equal(decrypted, plaintext);
  // Le budget relu s’enregistre exactement comme l’original.
  assert.equal(serializeBudget(deserializeStoredBudget(decrypted).budget), plaintext);
});

test('le serveur ne voit aucun montant, aucun libellé ni aucune date', async () => {
  const key = await deriveKey('une phrase bien longue', newSalt(), FAST);
  const { ciphertext } = await encryptText(key, serializeBudget(budget));
  for (const clear of ['84750', '115000', 'Loyer', 'mutuelle', '2026-12-01', 'currentBalance']) {
    assert.equal(ciphertext.includes(clear), false, `« ${clear} » apparaît dans le bloc chiffré`);
  }
});

test('deux chiffrements du même budget donnent deux blocs différents', async () => {
  const key = await deriveKey('une phrase bien longue', newSalt(), FAST);
  const a = await encryptText(key, 'même contenu');
  const b = await encryptText(key, 'même contenu');
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test('une mauvaise phrase secrète ou un bloc modifié sont refusés', async () => {
  const salt = newSalt();
  const encrypted = await encryptText(await deriveKey('une phrase bien longue', salt, FAST), 'budget');
  await assert.rejects(decryptText(await deriveKey('une autre phrase longue', salt, FAST), encrypted), WrongPassphraseError);
  const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -4) + 'AAAA' };
  await assert.rejects(decryptText(await deriveKey('une phrase bien longue', salt, FAST), tampered), WrongPassphraseError);
});

test('restaurer puis réexporter un budget redonne la même empreinte', async () => {
  const exported = serializeBudget(budget);
  const roundTrip = serializeBudget(deserializeStoredBudget(exported).budget);
  assert.equal(await fingerprint(roundTrip), await fingerprint(exported));
});

test('une phrase secrète trop courte est refusée', () => {
  assert.match(passphraseProblem('court'), /au moins 12 caractères/);
  assert.match(passphraseProblem('            '), /au moins 12 caractères/);
  assert.equal(passphraseProblem('ma phrase de douze'), undefined);
});

const memory = { userId: 'u1', version: 3, fingerprint: 'F' };

test('décisions : première copie, rien à faire, envoi', () => {
  assert.deepEqual(decideSync({ remoteVersion: null, memory: null, localFingerprint: 'F', localIsEmpty: false }), { action: 'create' });
  assert.deepEqual(decideSync({ remoteVersion: null, memory: null, localFingerprint: 'F', localIsEmpty: true }), { action: 'idle' });
  assert.deepEqual(decideSync({ remoteVersion: 3, memory, localFingerprint: 'F', localIsEmpty: false }), { action: 'idle' });
  assert.deepEqual(decideSync({ remoteVersion: 3, memory, localFingerprint: 'G', localIsEmpty: false }),
    { action: 'push', expectedVersion: 3 });
});

test('décisions : récupérer la copie en ligne quand cet appareil n’a rien changé', () => {
  assert.deepEqual(decideSync({ remoteVersion: 4, memory, localFingerprint: 'F', localIsEmpty: false }), { action: 'pull' });
  assert.deepEqual(decideSync({ remoteVersion: 4, memory: null, localFingerprint: 'X', localIsEmpty: true }), { action: 'pull' });
});

test('décisions : conflit quand les deux côtés ont changé, sans rien écraser', () => {
  assert.deepEqual(decideSync({ remoteVersion: 4, memory, localFingerprint: 'G', localIsEmpty: false }), { action: 'conflict' });
  // Un appareil jamais synchronisé, avec un budget, face à une copie en ligne existante.
  assert.deepEqual(decideSync({ remoteVersion: 1, memory: null, localFingerprint: 'G', localIsEmpty: false }), { action: 'conflict' });
});

test('la mémoire de synchronisation appartient à un seul compte et résiste aux données abîmées', () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key),
  };
  writeSyncMemory(storage, memory);
  assert.deepEqual(readSyncMemory(storage, 'u1'), memory);
  assert.equal(readSyncMemory(storage, 'autre-compte'), null);
  store.set(SYNC_MEMORY_KEY, '{abîmé');
  assert.equal(readSyncMemory(storage, 'u1'), null);
  clearSyncMemory(storage);
  assert.equal(readSyncMemory(storage, 'u1'), null);
});
