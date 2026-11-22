import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from '../app/api/budget-key/route.ts';

const testRootKey = Buffer.alloc(32, 91).toString('base64');
const userA = 'af55f7be-d503-4d48-9bf3-5a251237dcd0';
const userB = '945b929a-7062-4fc7-a0b6-506fba78bfd0';

function fixture(t, rootKey = testRootKey) {
  const config = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.test',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'cle-publique-fictive',
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

  const users = new Map([['premier-a', userA], ['autre-appareil-a', userA], ['session-b', userB]]);
  return t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), 'https://supabase.test/auth/v1/user');
    const token = new Headers(init.headers).get('authorization')?.slice('Bearer '.length);
    const userId = users.get(token);
    if (token === 'panne-auth') return Response.json({ message: 'Service indisponible' }, { status: 503 });
    if (!userId) return Response.json({ message: 'Jeton révoqué', code: 'bad_jwt' }, { status: 401 });
    return Response.json({ id: userId });
  });
}

function request(token, body = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://capiste.test/api/budget-key', { method: 'POST', headers, body: JSON.stringify(body) });
}

test('le même compte retrouve sa clé après connexion sur un autre appareil', async (t) => {
  const auth = fixture(t);
  const first = await POST(request('premier-a'));
  const next = await POST(request('autre-appareil-a'));
  assert.equal(first.status, 200);
  assert.equal(next.status, 200);
  assert.equal(first.headers.get('cache-control'), 'private, no-store');
  assert.equal(next.headers.get('cache-control'), 'private, no-store');
  const result = await first.json();
  assert.deepEqual(await next.json(), result);
  assert.equal(result.version, 1);
  assert.equal(Buffer.from(result.material, 'base64').length, 32);
  assert.notEqual(result.material, testRootKey);
  assert.equal(auth.mock.callCount(), 2);
});

test('un compte obtient sa propre clé même s’il envoie un autre identifiant', async (t) => {
  fixture(t);
  const a = await POST(request('premier-a'));
  const b = await POST(request('session-b', { userId: userA }));
  const bExpected = await POST(request('session-b'));
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const keyB = await b.json();
  assert.notEqual(keyB.material, (await a.json()).material);
  assert.deepEqual(keyB, await bExpected.json());
});

test('un jeton absent, révoqué ou non vérifiable bloque la remise de la clé', async (t) => {
  const auth = fixture(t);
  for (const [token, status] of [[undefined, 401], ['revoque', 401], ['panne-auth', 503]]) {
    const response = await POST(request(token));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await response.json()).material, undefined);
  }
  assert.equal(auth.mock.callCount(), 2);
});

test('une clé serveur non configurée rend le service indisponible', async (t) => {
  const auth = fixture(t, '');
  const response = await POST(request('premier-a'));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).material, undefined);
  assert.equal(auth.mock.callCount(), 0);
});
