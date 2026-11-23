import assert from 'node:assert/strict';
import { test } from 'node:test';
import { materializeHousehold } from '../lib/household-materialize.ts';
import {
  encodeHouseholdWrites, decodeHouseholdView, reconcileHouseholdSync, syncHousehold,
} from '../lib/household-sync.ts';

const householdId = 'af55f7be-d503-4d48-9bf3-5a251237dcd0';
const checkpointId = '96eaeed9-540c-4971-9297-9d72c69a501a';
const date = '2026-11-22';
const scope = { householdId, keyVersion: 1 };
const empty = { cursor: 0, confirmed: [], pending: [] };
const checkpoint = { kind: 'checkpoint', id: checkpointId, data: { checkpointId, date, amount: 50000 } };

function expense(amount) {
  return {
    kind: 'spending', id: 'courses', data: {
      id: 'courses', amount, date, category: 'groceries', balanceIncluded: false, debited: true, balanceRevision: 0,
    },
    balanceEffect: { checkpointId, deltaCents: -amount },
  };
}

const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

test('Une file enregistrée hors ligne reste chiffrée et garde les mêmes identifiants après rechargement', async () => {
  const pending = await encodeHouseholdWrites(key, scope, [checkpoint, expense(6500)]);
  const reloaded = structuredClone({ ...empty, pending });
  assert.deepEqual(reloaded.pending, pending);
  assert.ok(reloaded.pending.every(row => !Object.hasOwn(row, 'data') && !Object.hasOwn(row, 'balanceEffect')));
  assert.equal(materializeHousehold(await decodeHouseholdView(key, householdId, reloaded)).currentBalance, 435);
});

test('L’accusé d’un ancien lot retire seulement ses écritures et ne saute aucune ligne distante', async () => {
  const [base, old, newest] = await encodeHouseholdWrites(key, scope, [checkpoint, expense(2000), expense(4000)]);
  const local = { cursor: 1, confirmed: [{ ...base, seq: 1 }], pending: [old, newest] };
  const stable = reconcileHouseholdSync(local, { rows: [{ ...old, seq: 2 }], cursor: 2, acknowledged: [old.write_id] });
  const wrongOrder = reconcileHouseholdSync(stable, { rows: [{ ...old, seq: 1 }], cursor: 1, acknowledged: [] });
  assert.deepEqual(wrongOrder, stable);
  assert.deepEqual(stable.pending, [newest]);
  assert.equal(materializeHousehold(await decodeHouseholdView(key, householdId, stable)).currentBalance, 460);
});

test('Une réponse perdue conserve la file et le prochain envoi réutilise le write_id', async () => {
  const [base, queued] = await encodeHouseholdWrites(key, scope, [checkpoint, expense(6500)]);
  const cache = { cursor: 1, confirmed: [{ ...base, seq: 1 }], pending: [queued] };
  const sent = [];
  let failed = true;
  const remote = {
    async push(rows) {
      sent.push(rows);
      if (failed) throw new Error('Connexion interrompue');
      return [{ record_id: queued.record_id, seq: 2 }];
    },
    async pull(after) {
      assert.equal(after, 1);
      return [{ ...queued, seq: 2 }];
    },
  };
  await assert.rejects(syncHousehold(remote, cache));
  failed = false;
  const synced = reconcileHouseholdSync(cache, await syncHousehold(remote, cache));
  assert.equal(synced.pending.length, 0);
  assert.deepEqual(sent, [[queued], [queued]]);
  assert.equal(materializeHousehold(await decodeHouseholdView(key, householdId, synced)).currentBalance, 435);
});

test('La réception traverse la limite de 1 000 lignes en suivant les séquences serveur', async () => {
  const [row] = await encodeHouseholdWrites(key, scope, [checkpoint]);
  const cursors = [];
  const sync = await syncHousehold({
    async push() { throw new Error('Aucune écriture en attente'); },
    async pull(cursor) {
      cursors.push(cursor);
      return cursor === 0
        ? Array.from({ length: 1000 }, (_, index) => ({ ...row, seq: index + 1 }))
        : [{ ...row, seq: 1001 }];
    },
  }, empty);
  assert.deepEqual(cursors, [0, 1000]);
  assert.equal(sync.cursor, 1001);
  assert.equal(sync.rows.length, 1001);
});

test('PR 5a · un élément illisible est écarté et signalé, les autres restent lisibles', async () => {
  const [base, spending, other] = await encodeHouseholdWrites(key, scope, [checkpoint, expense(6500), { ...expense(1000), id: 'autre' }]);
  const altered = { ...other, ciphertext: other.ciphertext.slice(0, -4) + (other.ciphertext.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
  const foreign = { ...spending, record_id: other.record_id === spending.record_id ? spending.record_id : crypto.randomUUID() };
  let skipped = -1;
  const rows = await decodeHouseholdView(key, householdId, {
    cursor: 3, confirmed: [{ ...base, seq: 1 }, { ...altered, seq: 2 }, { ...foreign, seq: 3 }], pending: [],
  }, (count) => { skipped = count; });
  assert.equal(skipped, 2, 'contenu altéré et élément déplacé');
  assert.deepEqual(rows.map(({ record }) => record.kind), ['checkpoint']);
  assert.equal(materializeHousehold(rows).currentBalance, 500);

  let none = -1;
  await decodeHouseholdView(key, householdId, { ...empty, pending: [base, spending] }, (count) => { none = count; });
  assert.equal(none, 0);
});
