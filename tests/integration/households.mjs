import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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

// Les identifiants de compte restent vérifiés dans le stockage interne avec le rôle serveur.
// La projection publique du foyer a son propre test de confidentialité.
async function internalRecords(h) {
  return success(await admin.from('household_records').select('record_id,created_by,updated_by').eq('household_id', h).order('seq'));
}

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
    const publicColumn = table === 'households' ? 'id' : 'household_id';
    assert.deepEqual(success(await personB.api.from(table).select(publicColumn)), []);
    assert.ok((await anonymous.from(table).select(publicColumn)).error);
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
  const [attribution] = await internalRecords(h);
  assert.equal(attribution.created_by, personA.id);
  assert.deepEqual(await decryptHouseholdRecord(secondKey, h, stored), { kind: 'spending', id, data: { amount: 6300 } });

  const budget = {
    user_id: personA.id, ciphertext: 'x'.repeat(20), iv: 'x'.repeat(16), salt: 'x'.repeat(12), kdf_iterations: 100000,
  };
  success(await personA.api.from('budget_vaults').insert(budget));
  assert.deepEqual(success(await personB.api.from('budget_vaults').select('*').eq('user_id', personA.id)), []);

  const [memberB] = success(await admin.from('household_members').select('member_id').eq('household_id', h).eq('user_id', personB.id));
  success(await rpc(personA, 'stop_sharing_with', { h, other_member: memberB.member_id }));
  assert.equal((await requestKey(personB, h)).status, 403);
  assert.ok((await rpc(personB, 'pull_records', { h, after_seq: 0 })).error);
  assert.ok((await rpc(personB, 'upsert_records', { h, records: [record] })).error);
  assert.deepEqual(success(await personB.api.from('household_records').select('record_id').eq('household_id', h)), []);
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
  const [row] = success(await rpc(personA, 'pull_records', { h, after_seq: 2 }));
  const edited = (await internalRecords(h)).find(({ record_id }) => record_id === row.record_id);
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
  const [attribution] = await internalRecords(h);
  assert.equal(attribution.updated_by, personB.id);
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

test('F5 · Le serveur fixe l’auteur et garde le caractère exclusif d’origine', async () => {
  const { household_id: h, member_id: author } = await createHousehold(personA);
  const [{ member_id: partner }] = success(await rpc(personB, 'accept_invitation', await invite(personA, h)));
  const key = await importKey(personA, h);
  const regular = await encryptedRecord(key, h, 'spending', randomUUID(), { amount: 500 });
  const declaration = await encryptedRecord(key, h, 'transfer', randomUUID(), { amount: 5000 });
  const original = { ...declaration, exclusive: true, author_member_id: partner };
  const input = { h, records: [{ ...regular, author_member_id: partner }, original] };
  const receipts = success(await rpc(personA, 'upsert_records', input));
  assert.deepEqual(success(await rpc(personA, 'upsert_records', input)), receipts);

  const write = (actor, record, data) => rpc(actor, 'upsert_records', {
    h, records: [{ ...record, ...data, write_id: randomUUID() }],
  });
  success(await write(personB, regular, { exclusive: true, author_member_id: partner }));
  success(await write(personA, original, { exclusive: false, author_member_id: partner }));

  const result = success(await rpc(personA, 'pull_records', { h, after_seq: 0 }));
  const shared = result.find(({ record_id }) => record_id === regular.record_id);
  const exclusive = result.find(({ record_id }) => record_id === declaration.record_id);
  assert.equal(shared.author_member_id, author);
  assert.equal(shared.exclusive, false);
  assert.equal(exclusive.author_member_id, author);
  assert.equal(exclusive.exclusive, true);
  assert.equal(Object.hasOwn(exclusive, 'amount'), false);
  assert.equal((await decryptHouseholdRecord(key, h, exclusive)).data.amount, 5000);
  assert.equal((await write(personB, original, { exclusive: false })).error?.code, '42501');
});

test('F5 · Une déclaration et une réponse exclusives résistent aux modifications et aux suppressions de l’autre membre', async () => {
  const { household_id: h } = await createHousehold(personA);
  success(await rpc(personB, 'accept_invitation', await invite(personA, h)));
  const key = await importKey(personA, h);
  const declaration = await encryptedRecord(key, h, 'transfer', randomUUID(), { amount: 5000 });
  const reply = await encryptedRecord(key, h, 'transfer-response', randomUUID(), { status: 'confirmed' });
  success(await rpc(personA, 'upsert_records', { h, records: [{ ...declaration, exclusive: true }] }));
  success(await rpc(personB, 'upsert_records', { h, records: [{ ...reply, exclusive: true }] }));

  for (const [actor, record] of [[personA, reply], [personB, declaration]]) {
    for (const deleted of [false, true]) {
      const result = await rpc(actor, 'upsert_records', {
        h, records: [{ ...record, write_id: randomUUID(), exclusive: false, deleted }],
      });
      assert.equal(result.error?.code, '42501');
    }
  }
  const rows = success(await rpc(personA, 'pull_records', { h, after_seq: 0 }));
  assert.deepEqual(rows.map(({ seq, deleted }) => ({ seq, deleted })), [
    { seq: 1, deleted: false }, { seq: 2, deleted: false },
  ]);
});

test('F5 · Un membre réinvité retrouve les droits sur son élément exclusif', async () => {
  const { household_id: h } = await createHousehold(personA);
  const [{ member_id: partner }] = success(await rpc(personB, 'accept_invitation', await invite(personA, h)));
  const key = await importKey(personB, h);
  const id = randomUUID();
  const first = await encryptedRecord(key, h, 'transfer', id, { amount: 5000 });
  success(await rpc(personB, 'upsert_records', { h, records: [{ ...first, exclusive: true }] }));

  success(await rpc(personB, 'leave_household', { h }));
  const edit = await encryptedRecord(key, h, 'transfer', id, { amount: 6000 });
  assert.equal((await rpc(personB, 'upsert_records', { h, records: [edit] })).error?.code, '42501');

  const [{ member_id: returned }] = success(await rpc(personB, 'accept_invitation', await invite(personA, h)));
  assert.equal(returned, partner);
  success(await rpc(personB, 'upsert_records', { h, records: [edit] }));
  const [row] = success(await rpc(personA, 'pull_records', { h, after_seq: 0 }));
  assert.equal(row.author_member_id, partner);
  assert.equal(row.exclusive, true);
  assert.equal((await decryptHouseholdRecord(key, h, row)).data.amount, 6000);
});

test('F5 · La réponse d’un compte supprimé reste attribuable et figée pour un nouveau lecteur', async () => {
  const sam = await person();
  const { household_id: h, member_id: marc } = await createHousehold(personA);
  const [{ member_id: recipient }] = success(await rpc(sam, 'accept_invitation', await invite(personA, h)));
  const key = await importKey(sam, h);
  const transferId = randomUUID();
  const declarationData = {
    transferId, fromMemberId: marc, toMemberId: recipient, amount: 5000, date: '2026-11-21', revision: randomUUID(),
  };
  const declaration = await encryptedRecord(key, h, 'transfer', transferId, declarationData);
  const declarationHash = createHash('sha256').update(JSON.stringify(declarationData)).digest('hex');
  const reply = await encryptedRecord(key, h, 'transfer-response', randomUUID(), {
    transferId, declarationHash, status: 'confirmed',
  });
  success(await rpc(personA, 'upsert_records', { h, records: [{ ...declaration, exclusive: true }] }));
  success(await rpc(sam, 'upsert_records', { h, records: [{ ...reply, exclusive: true }] }));
  success(await rpc(sam, 'delete_my_account'));

  const fresh = client(publicKey);
  success(await fresh.auth.setSession({
    access_token: personA.token,
    refresh_token: success(await personA.api.auth.getSession()).session.refresh_token,
  }));
  const rows = success(await fresh.rpc('pull_records', { h, after_seq: 0 }));
  const retained = rows.find(({ record_id }) => record_id === reply.record_id);
  const attribution = (await internalRecords(h)).find(({ record_id }) => record_id === retained.record_id);
  assert.equal(attribution.created_by, null);
  assert.equal(retained.author_member_id, recipient);
  assert.equal(retained.editor_member_id, recipient);
  assert.equal(retained.ciphertext, reply.ciphertext);
  assert.deepEqual(success(await fresh.from('household_members').select('member_id').eq('household_id', h)), [{ member_id: marc }]);

  const writing = await fresh.rpc('upsert_records', {
    h, records: [{ ...reply, write_id: randomUUID(), deleted: true, author_member_id: marc }],
  });
  assert.equal(writing.error?.code, '42501');
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
  assert.deepEqual(await internalRecords(h), [
    { record_id: one.record_id, created_by: null, updated_by: null },
    { record_id: two.record_id, created_by: personB.id, updated_by: null },
  ]);
  assert.deepEqual(await decryptHouseholdRecord(await importKey(personB, h), h, rows[0]),
    { kind: 'spending', id: one.record_id, data: { amount: 500 } });
  const members = success(await admin.from('household_members').select('user_id').eq('household_id', h));
  assert.deepEqual(members, [{ user_id: personB.id }]);

  await invite(personB, h);
  success(await rpc(personB, 'leave_household', { h }));
  for (const table of ['households', 'household_members', 'household_records', 'household_invitations']) {
    const idColumn = table === 'households' ? 'id' : 'household_id';
    assert.deepEqual(success(await admin.from(table).select('*').eq(idColumn, h)), []);
  }
});

test('Confidentialité · les lectures attestent l’auteur et le dernier membre ayant modifié, sans identifiant Supabase', async () => {
  const { household_id: h, member_id: author } = await createHousehold(personA);
  const [{ member_id: editor }] = success(await rpc(personB, 'accept_invitation', await invite(personA, h)));
  const key = await importKey(personA, h);
  const id = randomUUID();
  const first = await encryptedRecord(key, h, 'spending', id, { amount: 5000 });
  const edit = await encryptedRecord(key, h, 'spending', id, { amount: 5500 });
  success(await rpc(personA, 'upsert_records', { h, records: [{ ...first, editor_member_id: editor }] }));
  const [created] = success(await rpc(personB, 'pull_records', { h, after_seq: 0 }));
  assert.equal(Object.hasOwn(created, 'created_by'), false);
  assert.equal(Object.hasOwn(created, 'updated_by'), false);
  assert.equal(created.author_member_id, author);
  assert.equal(created.editor_member_id, author);
  success(await rpc(personB, 'upsert_records', { h, records: [{ ...edit, editor_member_id: author }] }));
  const [updated] = success(await rpc(personA, 'pull_records', { h, after_seq: 1 }));
  assert.equal(updated.author_member_id, author);
  assert.equal(updated.editor_member_id, editor);
  assert.equal(Object.hasOwn(updated, 'created_by'), false);
  assert.equal(Object.hasOwn(updated, 'updated_by'), false);
  assert.deepEqual(await decryptHouseholdRecord(key, h, updated), { kind: 'spending', id, data: { amount: 5500 } });

  for (const actor of [personA, personB]) {
    const account = actor.api;
    assert.equal((await account.from('household_records').select('created_by,updated_by').eq('household_id', h)).error?.code, '42501');
    assert.equal((await account.from('household_members').select('user_id').eq('household_id', h)).error?.code, '42501');
    assert.equal((await account.from('household_members').select('member_id').eq('user_id', personB.id)).error?.code, '42501');
    assert.equal((await account.from('households').select('id,household_members(user_id)').eq('id', h)).error?.code, '42501');
    const [read] = success(await account.from('household_records').select('author_member_id,editor_member_id').eq('household_id', h));
    assert.deepEqual(read, { author_member_id: author, editor_member_id: editor });
    const own = success(await rpc(actor, 'list_my_households')).find(row => row.household_id === h);
    assert.equal(own.member_id, actor === personA ? author : editor);
    assert.deepEqual(new Set(own.active_member_ids), new Set([author, editor]));
    assert.equal(Object.hasOwn(own, 'user_id'), false);
  }
  assert.ok((await anonymous.rpc('list_my_households')).error);
  assert.equal(success(await rpc(personC, 'list_my_households')).some(row => row.household_id === h), false);
  success(await rpc(personB, 'leave_household', { h }));
  assert.equal(success(await rpc(personB, 'list_my_households')).some(row => row.household_id === h), false);
  const listing = success(await rpc(personA, 'list_my_households')).find(row => row.household_id === h);
  assert.deepEqual(listing.active_member_ids, [author]);
  assert.equal((await rpc(personB, 'pull_records', { h, after_seq: 0 })).error?.code, '42501');
});
