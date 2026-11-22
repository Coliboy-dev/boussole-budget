import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { buildInvitationLink, createInvitationToken } from '../lib/household-invitations.ts';
import { decryptHouseholdRecord, derivedRecordId, encryptHouseholdRecord, householdRecordId } from '../lib/household-records.ts';

const householdId = 'af55f7be-d503-4d48-9bf3-5a251237dcd0';
const otherId = '96eaeed9-540c-4971-9297-9d72c69a501a';
const scope = { householdId, recordId: otherId, keyVersion: 1 };
const spending = { kind: 'spending', id: otherId, data: { label: 'Courses', amount: 4200, date: '2026-11-22' } };

async function testKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

test('Les identifiants dérivés sont déterministes et propres au foyer et à la clé de dérivation', async () => {
  assert.equal(await derivedRecordId(householdId, 'settings'), 'a18aa395-3b2c-5b05-82af-84a5817336f9');
  assert.equal(await derivedRecordId(householdId, `member|${otherId}`), 'ba518c37-17ff-5a21-974f-913eb831b00e');
  assert.notEqual(await derivedRecordId(householdId, 'settings'), await derivedRecordId(otherId, 'settings'));
});

test('L’identifiant du moteur reste dans le contenu chiffré et le profil garde l’UUID attendu par SQL', async () => {
  assert.equal(await householdRecordId(householdId, 'member', otherId), 'ba518c37-17ff-5a21-974f-913eb831b00e');

  const key = await testKey();
  const engineId = 'gap-2026-11-22';
  const recordId = await householdRecordId(householdId, 'gap', engineId);
  assert.equal(recordId, await derivedRecordId(householdId, `gap|${engineId}`));
  assert.notEqual(recordId, await householdRecordId(householdId, 'expense', engineId));
  const row = { kind: 'gap', id: engineId, data: { amount: 2000, fromDate: '2026-11-21', date: '2026-11-22' } };
  const encrypted = await encryptHouseholdRecord(key, { ...scope, recordId }, row);
  assert.equal(encrypted.record_id, recordId);
  assert.deepEqual(await decryptHouseholdRecord(key, householdId, encrypted), row);
});

test('Le serveur reçoit le bloc chiffré et ses métadonnées, les éléments restent lisibles avec la clé', async () => {
  const key = await testKey();
  const encrypted = await encryptHouseholdRecord(key, scope, spending);
  assert.deepEqual(Object.keys(encrypted).sort(), ['ciphertext', 'deleted', 'iv', 'key_version', 'record_id']);
  assert.equal(encrypted.record_id, scope.recordId);
  assert.equal(encrypted.key_version, 1);
  assert.equal(encrypted.deleted, false);
  assert.equal(Buffer.from(encrypted.iv, 'base64').length, 12);
  const repeated = await encryptHouseholdRecord(key, scope, spending);
  assert.notEqual(encrypted.iv, repeated.iv);
  assert.notEqual(encrypted.ciphertext, repeated.ciphertext);
  assert.deepEqual(await decryptHouseholdRecord(key, householdId, encrypted), spending);
});

test('La clé et les identifiants du foyer, de l’élément et de la version authentifient le contenu', async () => {
  const key = await testKey();
  const encrypted = await encryptHouseholdRecord(key, scope, spending);

  await assert.rejects(decryptHouseholdRecord(await testKey(), householdId, encrypted));
  await assert.rejects(decryptHouseholdRecord(key, otherId, encrypted));
  await assert.rejects(decryptHouseholdRecord(key, householdId, { ...encrypted, record_id: householdId }));
  await assert.rejects(decryptHouseholdRecord(key, householdId, { ...encrypted, key_version: 2 }));
  await assert.rejects(decryptHouseholdRecord(key, householdId, { ...encrypted, deleted: true }));
});

test('Une suppression conserve seulement le type et l’identifiant de l’élément', async () => {
  const key = await testKey();
  const tombstone = { kind: spending.kind, id: spending.id };
  const encrypted = await encryptHouseholdRecord(key, scope, tombstone);

  assert.equal(encrypted.deleted, true);
  assert.deepEqual(await decryptHouseholdRecord(key, householdId, encrypted), tombstone);
  await assert.rejects(decryptHouseholdRecord(key, householdId, { ...encrypted, deleted: false }));
});

test('Le lien ne contient que l’identifiant d’invitation et le jeton aléatoire', async () => {
  const { token, tokenHash } = await createInvitationToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(token, 'base64url').length, 32);
  assert.equal(tokenHash, createHash('sha256').update(token).digest('hex'));
  assert.notEqual(token, (await createInvitationToken()).token);

  const url = new URL(buildInvitationLink('https://capiste.test', householdId, token));
  assert.equal(url.origin, 'https://capiste.test');
  assert.equal(url.pathname, '/foyer/rejoindre');
  assert.equal(url.search, '');
  assert.deepEqual([...new URLSearchParams(url.hash.slice(1))], [['i', householdId], ['t', token]]);
});
