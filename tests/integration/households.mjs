import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { POST } from '../../app/api/household-key/route.ts';
import { createInvitationToken } from '../../lib/household-invitations.ts';
import { decryptHouseholdRecord, encryptHouseholdRecord, householdRecordId } from '../../lib/household-records.ts';
import { recordPayment } from '../../lib/budget-state.ts';
import { diffHousehold } from '../../lib/household-diff.ts';
import { materializeHousehold } from '../../lib/household-materialize.ts';

const url = new URL(process.env.SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Utilise une instance Supabase locale.');
const publicKey = process.env.SUPABASE_LOCAL_PUBLISHABLE_KEY;
const adminKey = process.env.SUPABASE_LOCAL_SECRET_KEY;
assert.ok(publicKey && adminKey, 'Renseigne les clés de l’instance Supabase locale.');
process.env.NEXT_PUBLIC_SUPABASE_URL = url.origin;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publicKey;
process.env.BUDGET_VAULT_MANAGED_KEY_V1 = randomBytes(32).toString('base64');

const auth = { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false };
const client = (key) => createClient(url.origin, key, { auth });
const admin = client(adminKey);
const anonymous = client(publicKey);
const createdUsers = [];
let personA;
let personB;
let personC;
let personD;

function success({ data, error }) {
  assert.equal(error, null, error?.message);
  return data;
}

async function person() {
  const email = `foyer-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('hex');
  const { user } = success(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  createdUsers.push(user.id);
  const api = client(publicKey);
  const { session } = success(await api.auth.signInWithPassword({ email, password }));
  return { api, id: user.id, token: session.access_token };
}

before(async () => {
  personA = await person();
  personB = await person();
  personC = await person();
  personD = await person();
});

after(async () => {
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
});

const rpc = (actor, name, args) => actor.api.rpc(name, args);

test('La version de synchronisation n’est disponible qu’après la migration des reçus', async () => {
  assert.equal(success(await rpc(personA, 'household_sync_version')), 2);
  assert.ok((await anonymous.rpc('household_sync_version')).error);
});

async function createHousehold(actor) {
  const [row] = success(await rpc(actor, 'create_household'));
  return row;
}

async function invite(actor, h) {
  const { token, tokenHash } = await createInvitationToken();
  const invitation = success(await rpc(actor, 'create_invitation', { h, token_hash: tokenHash }));
  return { invitation, token };
}

async function requestKey(actor, householdId) {
  return POST(new Request('http://localhost/api/household-key', {
    method: 'POST',
    headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ householdId }),
  }));
}

async function importKey(actor, householdId) {
  const response = await requestKey(actor, householdId);
  assert.equal(response.status, 200);
  const { material, version } = await response.json();
  assert.equal(version, 1);
  return crypto.subtle.importKey('raw', Buffer.from(material, 'base64'), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptedRecord(key, householdId, kind, id, data, recordId = id) {
  return {
    ...await encryptHouseholdRecord(key, { householdId, recordId, keyVersion: 1 }, { kind, id, data }),
    write_id: randomUUID(),
  };
}

test('F-E · Seuls les membres actifs lisent et écrivent les éléments et obtiennent la clé', async () => {
  const { household_id: h } = await createHousehold(personA);
  const { household_id: other } = await createHousehold(personC);
  const id = randomUUID();
  const key = await importKey(personA, h);
  const record = await encryptedRecord(key, h, 'spending', id, { amount: 6300 });

  assert.deepEqual(success(await rpc(personA, 'upsert_records', { h, records: [record] })), [{ record_id: id, seq: 1 }]);
  for (const table of ['households', 'household_members', 'household_records']) {
    assert.deepEqual(success(await personB.api.from(table).select('*')), []);
    assert.ok((await anonymous.from(table).select('*')).error);
  }
  assert.ok((await personA.api.from('household_invitations').select('*')).error);
  assert.ok((await personA.api.from('household_records').insert({ household_id: h, ...record, seq: 3 })).error);
  assert.ok((await rpc(personB, 'upsert_records', { h, records: [record] })).error);
  assert.ok((await rpc(personB, 'pull_records', { h, after_seq: 0 })).error);
  assert.ok((await anonymous.rpc('create_household')).error);
  assert.equal((await requestKey(personB, h)).status, 403);
  assert.equal((await requestKey(personA, other)).status, 403);

  success(await rpc(personB, 'accept_invitation', await invite(personA, h)));
  const secondKey = await importKey(personB, h);
  const [stored] = success(await rpc(personB, 'pull_records', { h, after_seq: 0 }));
  assert.equal(stored.created_by, personA.id);
  assert.deepEqual(await decryptHouseholdRecord(secondKey, h, stored), { kind: 'spending', id, data: { amount: 6300 } });

  const budget = {
    user_id: personA.id, ciphertext: 'x'.repeat(20), iv: 'x'.repeat(16), salt: 'x'.repeat(12), kdf_iterations: 100000,
  };
  success(await personA.api.from('budget_vaults').insert(budget));
  assert.deepEqual(success(await personB.api.from('budget_vaults').select('*').eq('user_id', personA.id)), []);

  const [memberB] = success(await personA.api.from('household_members').select('member_id').eq('household_id', h).eq('user_id', personB.id));
  success(await rpc(personA, 'stop_sharing_with', { h, other_member: memberB.member_id }));
  assert.equal((await requestKey(personB, h)).status, 403);
  assert.ok((await rpc(personB, 'pull_records', { h, after_seq: 0 })).error);
  assert.ok((await rpc(personB, 'upsert_records', { h, records: [record] })).error);
  assert.deepEqual(success(await personB.api.from('household_records').select('*').eq('household_id', h)), []);
  assert.equal((await requestKey(personA, h)).status, 200);
  assert.equal(success(await rpc(personA, 'pull_records', { h, after_seq: 0 })).length, 1);

  const [reactivated] = success(await rpc(personB, 'accept_invitation', await invite(personA, h)));
  assert.equal(reactivated.member_id, memberB.member_id);
  success(await rpc(personB, 'leave_household', { h }));
  assert.equal((await requestKey(personB, h)).status, 403);
});

test('F-E · Les invitations expirent, sont annulables et ne peuvent être utilisées que par un seul compte', async () => {
  const { household_id: h } = await createHousehold(personA);
  const expired = await invite(personA, h);
  success(await admin.from('household_invitations').update({ expires_at: '2000-01-01T00:00:00Z' }).eq('id', expired.invitation));
  const expiredResult = await rpc(personB, 'accept_invitation', expired);
  assert.equal(expiredResult.error?.message, 'Cette invitation n’est plus valable.');

  const revoked = await invite(personA, h);
  success(await rpc(personA, 'revoke_invitation', { h, invitation: revoked.invitation }));
  assert.equal((await rpc(personB, 'accept_invitation', revoked)).error?.message, expiredResult.error.message);
  const previous = await invite(personA, h);
  const current = await invite(personA, h);
  assert.equal((await rpc(personB, 'accept_invitation', previous)).error?.message, expiredResult.error.message);
  assert.equal((await rpc(personB, 'accept_invitation', {
    ...current, token: (await createInvitationToken()).token,
  })).error?.message, expiredResult.error.message);

  const concurrent = await Promise.all([
    rpc(personB, 'accept_invitation', current),
    rpc(personC, 'accept_invitation', current),
  ]);
  assert.equal(concurrent.filter((result) => result.error === null).length, 1);
  assert.equal(concurrent.find((result) => result.error)?.error.message, expiredResult.error.message);
  assert.equal((await rpc(personD, 'accept_invitation', current)).error?.message, expiredResult.error.message);
  const { token, tokenHash } = await createInvitationToken();
  assert.ok((await rpc(personA, 'create_invitation', { h, token_hash: tokenHash })).error);
  const [stillValid] = success(await admin.from('household_invitations')
    .insert({ household_id: h, created_by: personA.id, token_hash: tokenHash }).select('id'));
  assert.equal((await rpc(personD, 'accept_invitation', { invitation: stillValid.id, token })).error?.message,
    expiredResult.error.message);
  const members = success(await personA.api.from('household_members').select('member_id').eq('household_id', h).is('removed_at', null));
  assert.equal(members.length, 2);
});

test('Les lots suivent leur ordre, les écritures incompatibles sont annulées et l’auteur initial reste attribué', async () => {
  const { household_id: h } = await createHousehold(personA);
  success(await rpc(personB, 'accept_invitation', await invite(personA, h)));
  const key = await importKey(personA, h);
  const first = await encryptedRecord(key, h, 'spending', randomUUID(), { amount: 500 });
  const second = await encryptedRecord(key, h, 'spending', randomUUID(), { amount: 500 });
  assert.ok((await rpc(personA, 'upsert_records', { h, records: [first, { ...second, key_version: 2 }] })).error);
  assert.deepEqual(success(await rpc(personA, 'pull_records', { h, after_seq: 0 })), []);
  assert.deepEqual(success(await rpc(personA, 'upsert_records', { h, records: [first, second] })), [
    { record_id: first.record_id, seq: 1 }, { record_id: second.record_id, seq: 2 },
  ]);
  const edit = await encryptedRecord(key, h, 'spending', first.record_id, { amount: 750 });
  assert.deepEqual(success(await rpc(personB, 'upsert_records', { h, records: [edit] })), [{ record_id: first.record_id, seq: 3 }]);
  const [edited] = success(await rpc(personA, 'pull_records', { h, after_seq: 2 }));
  assert.equal(edited.created_by, personA.id);
  assert.equal(edited.updated_by, personB.id);
});

test('F-D · Le renvoi de A reçoit son numéro d’origine après une modification de B', async () => {
  const { household_id: h } = await createHousehold(personA);
  success(await rpc(personB, 'accept_invitation', await invite(personA, h)));
  const key = await importKey(personA, h);
  const id = 'loyer-ancien-identifiant';
  const recordId = await householdRecordId(h, 'expense', id);
  const first = await encryptedRecord(key, h, 'expense', id, { amount: 95000 }, recordId);
  const second = await encryptedRecord(key, h, 'expense', id, { amount: 92000 }, recordId);
  const original = success(await rpc(personA, 'upsert_records', { h, records: [first] }));
  assert.deepEqual(original, [{ record_id: first.record_id, seq: 1 }]);
  assert.deepEqual(success(await rpc(personB, 'upsert_records', { h, records: [second] })), [
    { record_id: second.record_id, seq: 2 },
  ]);
  assert.deepEqual(success(await rpc(personA, 'upsert_records', { h, records: [first] })), original);

  const [latest] = success(await rpc(personA, 'pull_records', { h, after_seq: 0 }));
  assert.equal(latest.updated_by, personB.id);
  assert.deepEqual(await decryptHouseholdRecord(key, h, latest), { kind: 'expense', id, data: { amount: 92000 } });
  assert.deepEqual(success(await rpc(personA, 'pull_records', { h, after_seq: 2 })), []);

  const another = await encryptedRecord(key, h, 'expense', id, { amount: 90000 }, recordId);
  assert.deepEqual(success(await rpc(personA, 'upsert_records', { h, records: [another] })), [
    { record_id: another.record_id, seq: 3 },
  ]);
  for (const api of [personA.api, anonymous, admin]) assert.ok((await api.from('household_writes').select('*')).error);
});

test('F-D · Deux appareils enregistrent la même échéance chiffrée et Supabase conserve un seul débit', async () => {
  const { household_id: h } = await createHousehold(personA);
  success(await rpc(personB, 'accept_invitation', await invite(personA, h)));
  const keys = await Promise.all([personA, personB].map(actor => importKey(actor, h)));
  const date = '2026-11-22';
  const checkpointId = randomUUID();
  const expense = {
    id: 'loyer', label: 'Loyer', amount: 100, frequency: 'monthly', category: 'rent',
    isPaid: false, isRecurring: true, dueDate: date,
  };
  const payment = { type: 'expense', id: expense.id, dueDate: date, today: date, balanceIncludesPayment: false };

  async function send(actor, key, changes) {
    const records = await Promise.all(changes.map(async record => {
      const recordId = await householdRecordId(h, record.kind, record.id);
      return { ...await encryptHouseholdRecord(key, { householdId: h, recordId, keyVersion: 1 }, record), write_id: randomUUID() };
    }));
    return success(await rpc(actor, 'upsert_records', { h, records }));
  }

  async function load(actor, key) {
    const rows = success(await rpc(actor, 'pull_records', { h, after_seq: 0 }));
    return Promise.all(rows.map(async row => ({ seq: row.seq, record: await decryptHouseholdRecord(key, h, row) })));
  }

  const empty = materializeHousehold([]);
  const initial = { ...empty, currentBalance: 500, balanceDate: date, balanceRevision: 1, expenses: [expense] };
  await send(personA, keys[0], diffHousehold(empty, initial, { rows: [], newCheckpointId: checkpointId }));
  const offlineChanges = await Promise.all([personA, personB].map(async (actor, index) => {
    const rows = await load(actor, keys[index]);
    const before = materializeHousehold(rows);
    return diffHousehold(before, recordPayment(before, payment), { rows, paymentDate: date });
  }));

  await Promise.all([personA, personB].map((actor, index) => send(actor, keys[index], offlineChanges[index])));
  const received = await load(personB, keys[1]);
  assert.equal(received.filter(({ record }) => record.kind === 'occurrence').length, 1);
  assert.equal(materializeHousehold(received).currentBalance, 400);
  assert.equal(materializeHousehold(received.toReversed()).currentBalance, 400);

  const paid = materializeHousehold(received);
  const cancelled = { ...paid, currentBalance: 500, expenses: [expense] };
  await send(personB, keys[1], diffHousehold(paid, cancelled, { rows: received }));
  assert.equal(materializeHousehold(await load(personA, keys[0])).currentBalance, 500);
});

test('F-E · La suppression d’un compte retire son profil et conserve le budget de l’autre membre', async () => {
  const { household_id: h, member_id: memberA } = await createHousehold(personD);
  const { household_id: onlyMember } = await createHousehold(personD);
  success(await rpc(personB, 'accept_invitation', await invite(personD, h)));
  const key = await importKey(personD, h);
  const one = await encryptedRecord(key, h, 'spending', randomUUID(), { amount: 500 });
  const two = await encryptedRecord(key, h, 'spending', randomUUID(), { amount: 800 });
  const profileId = await householdRecordId(h, 'member', memberA);
  const profile = await encryptedRecord(key, h, 'member', memberA, { memberId: memberA, name: 'Sam' }, profileId);
  success(await rpc(personB, 'upsert_records', { h, records: [two] }));
  success(await rpc(personD, 'upsert_records', { h, records: [one, { ...two, write_id: randomUUID() }, profile] }));
  success(await rpc(personD, 'delete_my_account'));
  assert.equal((await requestKey(personD, h)).status, 401);
  assert.deepEqual(success(await admin.from('households').select('id').eq('id', onlyMember)), []);

  const rows = success(await rpc(personB, 'pull_records', { h, after_seq: 0 }));
  assert.deepEqual(rows.map(({ record_id, created_by, updated_by }) => ({ record_id, created_by, updated_by })), [
    { record_id: one.record_id, created_by: null, updated_by: null },
    { record_id: two.record_id, created_by: personB.id, updated_by: null },
  ]);
  assert.deepEqual(await decryptHouseholdRecord(await importKey(personB, h), h, rows[0]),
    { kind: 'spending', id: one.record_id, data: { amount: 500 } });
  const members = success(await personB.api.from('household_members').select('user_id').eq('household_id', h));
  assert.deepEqual(members, [{ user_id: personB.id }]);

  await invite(personB, h);
  success(await rpc(personB, 'leave_household', { h }));
  for (const table of ['households', 'household_members', 'household_records', 'household_invitations']) {
    const idColumn = table === 'households' ? 'id' : 'household_id';
    assert.deepEqual(success(await admin.from(table).select('*').eq(idColumn, h)), []);
  }
});
