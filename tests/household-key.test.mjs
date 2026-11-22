import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { POST } from '../app/api/household-key/route.ts';
import { fetchHouseholdKey } from '../lib/household-key.ts';

const root = Buffer.alloc(32, 21);
const firstId = 'af55f7be-d503-4d48-9bf3-5a251237dcd0';
const secondId = '945b929a-7062-4fc7-a0b6-506fba78bfd0';
const outsiderId = '96eaeed9-540c-4971-9297-9d72c69a501a';
const publicKey = 'cle-publique-fictive';

function fixture(t, rootKey = root.toString('base64')) {
  const config = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.test',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
    BUDGET_VAULT_MANAGED_KEY_V1: rootKey,
  };
  for (const [name, value] of Object.entries(config)) {
    const previous = process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
    process.env[name] = value;
  }

  const identities = new Map([['membre-a', firstId], ['membre-b', secondId], ['non-membre', outsiderId]]);
  const membership = new Map([[firstId, new Set([firstId, secondId])], [secondId, new Set([firstId])]]);
  const upstream = t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://supabase.test');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('apikey'), publicKey);
    const token = headers.get('authorization')?.slice('Bearer '.length);
    const userId = identities.get(token);
    if (url.pathname === '/auth/v1/user') {
      if (token === 'panne-auth') return Response.json({}, { status: 503 });
      if (!userId) return Response.json({ code: 'bad_jwt' }, { status: 401 });
      return Response.json({ id: userId });
    }
    assert.equal(url.pathname, '/rest/v1/households');
    const householdId = url.searchParams.get('id')?.slice(3);
    assert.equal(url.searchParams.get('select'), 'id,key_version');
    if (!membership.get(householdId)?.has(userId)) return Response.json([]);
    return Response.json([{ id: householdId, key_version: 1 }]);
  });
  return { membership, upstream };
}

function request(token, householdId = firstId, userId) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://capiste.test/api/household-key', {
    method: 'POST', headers, body: JSON.stringify({ householdId, userId }),
  });
}

test('Les membres du même foyer obtiennent la même clé, distincte des clés des autres foyers et du compte', async (t) => {
  const { upstream } = fixture(t);
  const first = await POST(request('membre-a'));
  const second = await POST(request('membre-b'));
  const other = await POST(request('membre-a', secondId));
  for (const response of [first, second, other]) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  const shared = await first.json();
  assert.deepEqual(await second.json(), shared);
  assert.deepEqual(shared, {
    material: createHmac('sha256', root).update('capiste-household-vault:v1:' + firstId).digest('base64'),
    version: 1,
  });
  assert.notEqual((await other.json()).material, shared.material);
  assert.notEqual(createHmac('sha256', root).update('capiste-budget-vault:v1:' + firstId).digest('base64'), shared.material);
  assert.equal(upstream.mock.callCount(), 6);
});

test('Un non-membre, un ancien membre et un foyer absent reçoivent le même refus', async (t) => {
  const { membership } = fixture(t);
  membership.get(firstId).delete(secondId);
  const responses = await Promise.all([
    POST(request('non-membre', firstId, firstId)),
    POST(request('membre-b', firstId)),
    POST(request('membre-a', outsiderId)),
  ]);
  const bodies = [];
  for (const response of responses) {
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json();
    assert.equal(body.material, undefined);
    bodies.push(body);
  }
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[1], bodies[2]);
});

test('Un mauvais identifiant ou un jeton absent, révoqué ou non vérifiable bloque la route', async (t) => {
  const { upstream } = fixture(t);
  for (const [token, householdId, status] of [
    ['membre-a', 'invalide', 400],
    [undefined, firstId, 401],
    ['revoque', firstId, 401],
    ['panne-auth', firstId, 503],
  ]) {
    const response = await POST(request(token, householdId));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await response.json()).material, undefined);
  }
  assert.equal(upstream.mock.callCount(), 2);
});

test('Un secret serveur mal configuré rend la route indisponible', async (t) => {
  const { upstream } = fixture(t, root.toString('base64').slice(0, -1));
  assert.equal((await POST(request('membre-a'))).status, 503);
  assert.equal(upstream.mock.callCount(), 0);
});

test('Le client importe une clé non exportable rattachée à la session du compte', async (t) => {
  const upstream = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/household-key');
    assert.equal(init.method, 'POST');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer jeton-a');
    assert.deepEqual(JSON.parse(init.body), { householdId: secondId });
    return Response.json({ material: root.toString('base64'), version: 1 });
  });
  const auth = { getSession: async () => ({
    data: { session: { access_token: 'jeton-a', user: { id: firstId } } },
    error: null,
  }) };
  const result = await fetchHouseholdKey(auth, firstId, secondId);
  assert.equal(result.key.extractable, false);
  assert.equal(result.key.algorithm.length, 256);
  assert.equal(result.userId, firstId);
  assert.equal(result.householdId, secondId);
  assert.equal(result.keyVersion, 1);
  await assert.rejects(fetchHouseholdKey(auth, outsiderId, secondId));
  assert.equal(upstream.mock.callCount(), 1);
});
