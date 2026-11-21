import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  DEVICE_LOCK_STORAGE_KEY, base64UrlToBytes, bytesToBase64Url, readDeviceLock,
  removeDeviceLock, saveDeviceLock,
} from '../lib/device-lock-storage.ts';
import { canCompleteDeviceUnlock, derEs256ToRaw, verifyAssertion, verifyRegistration } from '../lib/webauthn-lock.ts';
import { LOCAL_STORAGE_KEYS, eraseLocalData } from '../lib/account-lifecycle.ts';

const RP = 'boussole.example.test';
const ORIGIN = 'https://' + RP;
const CHALLENGE = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const ID = Uint8Array.from({ length: 32 }, (_, i) => i + 80);
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
const jwk = pair.publicKey.export({ format: 'jwk' });
const b64 = (bytes) => bytesToBase64Url(new Uint8Array(bytes));
const sha = (bytes) => createHash('sha256').update(bytes).digest();
const concat = (...parts) => Buffer.concat(parts.map((p) => Buffer.from(p)));
const clientData = (type, challenge = CHALLENGE, origin = ORIGIN, crossOrigin = false) => Buffer.from(JSON.stringify({
  type, challenge: b64(challenge), origin, crossOrigin,
}));
const cose = concat(
  [0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20],
  base64UrlToBytes(jwk.x), [0x22, 0x58, 0x20], base64UrlToBytes(jwk.y),
);
const authData = (flags, includeAttested = false, rp = RP) => concat(
  sha(rp), [flags, 0, 0, 0, 0],
  ...(includeAttested ? [Buffer.alloc(16), [0, ID.length], ID, cose] : []),
);
const credential = (response, id = ID) => ({ type: 'public-key', rawId: Uint8Array.from(id).buffer, response });
function enrollmentResponse(options = {}) {
  const flags = options.flags ?? 0x45; // UP + UV + AT
  const auth = authData(flags, true, options.rp || RP);
  return credential({
    clientDataJSON: Uint8Array.from(clientData('webauthn.create', options.challenge ?? CHALLENGE, options.origin || ORIGIN, options.crossOrigin)).buffer,
    getPublicKeyAlgorithm: () => options.algorithm ?? -7,
    getPublicKey: () => Uint8Array.from(spki).buffer,
    getAuthenticatorData: () => Uint8Array.from(auth).buffer,
  }, options.id ?? ID);
}
function assertionResponse(options = {}) {
  const auth = authData(options.flags ?? 0x05, false, options.rp || RP);
  const client = clientData(options.type ?? 'webauthn.get', options.challenge ?? CHALLENGE,
    options.origin || ORIGIN, options.crossOrigin);
  const signed = concat(auth, sha(client));
  const signature = sign('sha256', signed, pair.privateKey); // ECDSA DER
  return credential({
    authenticatorData: Uint8Array.from(auth).buffer,
    clientDataJSON: Uint8Array.from(client).buffer,
    signature: Uint8Array.from(options.badSignature ? Buffer.from(signature).fill(0x11) : signature).buffer,
  }, options.id ?? ID);
}
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test('P5-B — inscription ES256 valide, clé SPKI et credential ID liés aux données attestées', async () => {
  const saved = await verifyRegistration(enrollmentResponse(), CHALLENGE, ORIGIN, RP);
  assert.equal(saved.credentialId, b64(ID));
  assert.equal(saved.publicKeySpki, b64(spki));
  assert.equal(saved.algorithm, -7);
  assert.equal(saved.rpId, RP);
});

test('P5-B — inscription refuse challenge, origine, crossOrigin, algorithme, ID et drapeaux', async () => {
  const scenarios = [
    enrollmentResponse({ challenge: new Uint8Array(32).fill(7) }),
    enrollmentResponse({ origin: 'https://evil.example' }),
    enrollmentResponse({ crossOrigin: true }),
    enrollmentResponse({ algorithm: -257 }),
    enrollmentResponse({ id: new Uint8Array(32).fill(3) }),
    enrollmentResponse({ flags: 0x41 }), // sans UV
    enrollmentResponse({ flags: 0x44 }), // sans UP
    enrollmentResponse({ flags: 0x05 }), // sans AT
    enrollmentResponse({ rp: 'other.example' }),
  ];
  for (const value of scenarios) await assert.rejects(verifyRegistration(value, CHALLENGE, ORIGIN, RP));
});

test('P5-B — assertion ES256 DER valide avec compteur zéro', async () => {
  const stored = await verifyRegistration(enrollmentResponse(), CHALLENGE, ORIGIN, RP);
  const response = assertionResponse();
  assert.equal(await verifyAssertion(response, stored, CHALLENGE, ORIGIN), true);
  assert.equal(derEs256ToRaw(response.response.signature).length, 64);
});

test('P5-B — assertion refuse chaque altération de sécurité', async () => {
  const stored = await verifyRegistration(enrollmentResponse(), CHALLENGE, ORIGIN, RP);
  const scenarios = [
    assertionResponse({ challenge: new Uint8Array(32).fill(7) }),
    assertionResponse({ origin: 'https://evil.example' }),
    assertionResponse({ crossOrigin: true }),
    assertionResponse({ type: 'webauthn.create' }),
    assertionResponse({ rp: 'other.example' }),
    assertionResponse({ flags: 0x01 }), // pas UV
    assertionResponse({ flags: 0x04 }), // pas UP
    assertionResponse({ badSignature: true }),
    assertionResponse({ id: new Uint8Array(32).fill(3) }),
  ];
  for (const value of scenarios) {
    assert.equal(await verifyAssertion(value, stored, CHALLENGE, ORIGIN), false);
  }
  assert.equal(await verifyAssertion(assertionResponse(), stored, CHALLENGE, 'https://other.example'), false);
  assert.equal(await verifyAssertion(assertionResponse(), { ...stored, publicKeySpki: b64(Buffer.alloc(91)) }, CHALLENGE, ORIGIN), false);
});

test('P5-B — une signature DER mal formée ne peut jamais être acceptée', () => {
  const broken = [
    Buffer.alloc(0), Buffer.from([0x30, 0x00]), Buffer.from([0x30, 0x04, 0x02, 0x01, 0x80, 0x00]),
    Buffer.from([0x30, 0x06, 0x02, 0x02, 0, 1, 0x02, 0x00]),
    Buffer.from([0x30, 0x06, 0x02, 0x01, 1, 0x02, 0x01, 1, 0]),
  ];
  for (const value of broken) assert.throws(() => derEs256ToRaw(value));
});

test('P5-B — stockage indépendant : invalidation WebAuthn ne rend jamais le PIN illisible', async () => {
  const stored = await verifyRegistration(enrollmentResponse(), CHALLENGE, ORIGIN, RP);
  const storage = memoryStorage({ 'boussole-lock-v1': 'PIN-ne-pas-toucher' });
  assert.deepEqual(readDeviceLock(storage, RP), { status: 'absent' });
  saveDeviceLock(storage, stored);
  assert.equal(readDeviceLock(storage, RP).status, 'valid');
  assert.equal(readDeviceLock(storage, 'autre.example').status, 'invalid');
  storage.setItem(DEVICE_LOCK_STORAGE_KEY, '{corrompu');
  assert.equal(readDeviceLock(storage, RP).status, 'invalid');
  assert.equal(storage.getItem('boussole-lock-v1'), 'PIN-ne-pas-toucher');
  removeDeviceLock(storage);
  assert.equal(readDeviceLock(storage, RP).status, 'absent');
  assert.equal(storage.getItem('boussole-lock-v1'), 'PIN-ne-pas-toucher');
});

test('P5-B — base64url strict, une écriture non persistée est refusée', async () => {
  assert.throws(() => base64UrlToBytes('***'));
  assert.throws(() => base64UrlToBytes('Zg=='));
  const stored = await verifyRegistration(enrollmentResponse(), CHALLENGE, ORIGIN, RP);
  const storage = memoryStorage();
  const broken = { ...storage, setItem: () => {} };
  assert.throws(() => saveDeviceLock(broken, stored));
});

test('P5-B — effacement inclut la référence de l’authentificateur', async () => {
  assert.ok(LOCAL_STORAGE_KEYS.includes(DEVICE_LOCK_STORAGE_KEY));
  const storage = memoryStorage(Object.fromEntries(LOCAL_STORAGE_KEYS.map((key) => [key, 'x'])));
  const outcome = await eraseLocalData({ storage, deleteKeyStore: async () => {} });
  assert.equal(outcome.ok, true);
  assert.equal(storage.getItem(DEVICE_LOCK_STORAGE_KEY), null);
});

test('P5-B — aucun résultat WebAuthn tardif ne peut ouvrir un budget', async () => {
  const credential = await verifyRegistration(enrollmentResponse(), CHALLENGE, ORIGIN, RP);
  const base = {
    generation: 4, currentGeneration: 4, phase: 'locked', pinValid: true,
    currentCredential: credential, storedCredential: credential, expectedCredential: credential,
    visible: true, focused: true, hiddenAt: null, hiddenBefore: null,
    epochBefore: 42, epochAfter: 42,
  };
  assert.equal(canCompleteDeviceUnlock(base), true);
  for (const change of [
    { currentGeneration: 5 }, // une autre tentative ou un autre onglet a verrouillé
    { phase: 'unlocked' }, { pinValid: false },
    { visible: false }, { focused: false }, // dialogue ou app en arrière-plan
    { hiddenAt: 100 }, { hiddenBefore: 100 }, // absent pendant Face ID
    { epochAfter: 43 }, // cadenas activé depuis autre onglet
    { storedCredential: null }, { currentCredential: null },
    { storedCredential: { ...credential, publicKeySpki: b64(Buffer.alloc(91, 1)) } },
    { currentCredential: { ...credential, credentialId: b64(Buffer.alloc(32, 2)) } },
  ]) {
    assert.equal(canCompleteDeviceUnlock({ ...base, ...change }), false, JSON.stringify(change));
  }
});
