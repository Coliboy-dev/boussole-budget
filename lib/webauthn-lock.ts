import {
  base64UrlToBytes, bytesToBase64Url, type DeviceCredential,
} from './device-lock-storage.ts';

// WebAuthn local : validation de l'inscription et de l'assertion.
// Pas d'attestation matérielle (attestation:'none'), ni chiffrement du budget.
const utf8 = new TextDecoder('utf-8', { fatal: true });

function requireCondition(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

export function randomChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function deviceAuthenticatorAvailable(): Promise<boolean> {
  try {
    if (!globalThis.isSecureContext || typeof navigator === 'undefined' || !navigator.credentials?.create
      || !navigator.credentials?.get || typeof PublicKeyCredential === 'undefined'
      || typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
      || typeof AuthenticatorAttestationResponse === 'undefined'
      || typeof AuthenticatorAttestationResponse.prototype.getPublicKey !== 'function'
      || typeof AuthenticatorAttestationResponse.prototype.getPublicKeyAlgorithm !== 'function'
      || typeof AuthenticatorAttestationResponse.prototype.getAuthenticatorData !== 'function') return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function checkClientData(buffer: ArrayBuffer, type: 'webauthn.create' | 'webauthn.get',
  challenge: Uint8Array, origin: string): void {
  const parsed: unknown = JSON.parse(utf8.decode(buffer));
  requireCondition(!!parsed && typeof parsed === 'object', 'Réponse WebAuthn invalide.');
  const data = parsed as Record<string, unknown>;
  requireCondition(data.type === type && data.origin === origin && data.crossOrigin !== true,
    'Origine ou type WebAuthn inattendu.');
  requireCondition(typeof data.challenge === 'string', 'Défi WebAuthn manquant.');
  requireCondition(sameBytes(base64UrlToBytes(data.challenge), challenge), 'Défi WebAuthn incorrect.');
}

async function checkAuthenticatorData(data: Uint8Array, rpId: string, requireAttested: boolean): Promise<void> {
  requireCondition(data.length >= 37, 'Données de l’authentificateur incomplètes.');
  const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
  requireCondition(sameBytes(data.subarray(0, 32), expected), 'Domaine WebAuthn incorrect.');
  const flags = data[32];
  requireCondition((flags & 0x01) !== 0 && (flags & 0x04) !== 0,
    'Vérification de l’utilisateur absente.');
  if (requireAttested) requireCondition((flags & 0x40) !== 0, 'Credential attesté absent.');
}

/** DER Ecdsa-Sig-Value -> 64 octets P1363, avec rejet strict des entiers non canoniques. */
export function derEs256ToRaw(buffer: ArrayBuffer | Uint8Array): Uint8Array {
  const der = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  requireCondition(der.length >= 8 && der.length <= 72 && der[0] === 0x30
    && der[1] === der.length - 2, 'Signature DER invalide.');
  let index = 2;
  const takeInteger = (): Uint8Array => {
    requireCondition(der[index++] === 0x02, 'Entier DER manquant.');
    const length = der[index++];
    requireCondition(length >= 1 && length <= 33 && index + length <= der.length, 'Longueur DER incorrecte.');
    let value = der.subarray(index, index + length);
    index += length;
    requireCondition((value[0] & 0x80) === 0, 'Entier DER négatif.');
    if (value.length > 1 && value[0] === 0) {
      requireCondition((value[1] & 0x80) !== 0, 'Entier DER surlong.');
      value = value.subarray(1);
    }
    requireCondition(value.length <= 32, 'Entier DER trop grand.');
    const padded = new Uint8Array(32);
    padded.set(value, 32 - value.length);
    return padded;
  };
  const r = takeInteger();
  const s = takeInteger();
  requireCondition(index === der.length, 'Octets DER supplémentaires.');
  const raw = new Uint8Array(64);
  raw.set(r);
  raw.set(s, 32);
  return raw;
}

type CborValue = number | Uint8Array;
function decodeCoseKey(data: Uint8Array, offset: number): { values: Map<number, CborValue>; end: number } {
  let pos = offset;
  const count = (additional: number): number => {
    if (additional < 24) return additional;
    if (additional === 24) {
      requireCondition(pos < data.length, 'CBOR incomplet.');
      const value = data[pos++];
      requireCondition(value >= 24, 'CBOR non canonique.');
      return value;
    }
    if (additional === 25) {
      requireCondition(pos + 2 <= data.length, 'CBOR incomplet.');
      const value = (data[pos++] << 8) | data[pos++];
      requireCondition(value > 255, 'CBOR non canonique.');
      return value;
    }
    throw new Error('CBOR non pris en charge.');
  };
  const read = (): CborValue | { length: number } => {
    requireCondition(pos < data.length, 'CBOR manquant.');
    const initial = data[pos++];
    const major = initial >> 5;
    const length = count(initial & 31);
    if (major === 0) return length;
    if (major === 1) return -1 - length;
    if (major === 2) {
      requireCondition(pos + length <= data.length, 'CBOR binaire incomplet.');
      const value = data.subarray(pos, pos + length);
      pos += length;
      return value;
    }
    if (major === 5) return { length };
    throw new Error('Type CBOR inattendu.');
  };
  const header = read();
  requireCondition(typeof header === 'object' && !(header instanceof Uint8Array)
    && header.length >= 5 && header.length <= 12, 'Clé COSE absente.');
  const values = new Map<number, CborValue>();
  for (let i = 0; i < header.length; i++) {
    const key = read();
    const value = read();
    requireCondition(typeof key === 'number' && (typeof value === 'number' || value instanceof Uint8Array)
      && !values.has(key), 'Entrée COSE incorrecte.');
    values.set(key, value);
  }
  return { values, end: pos };
}

function parseAttestedKey(authData: Uint8Array): { id: Uint8Array; x: Uint8Array; y: Uint8Array } {
  // 32 rpIdHash + 1 flags + 4 signCount + 16 AAGUID + 2 credential ID length.
  requireCondition(authData.length >= 55, 'Credential attesté incomplet.');
  const idLength = (authData[53] << 8) | authData[54];
  requireCondition(idLength >= 16 && idLength <= 512 && authData.length >= 55 + idLength,
    'Identifiant WebAuthn invalide.');
  const id = authData.subarray(55, 55 + idLength);
  const cose = decodeCoseKey(authData, 55 + idLength);
  requireCondition(cose.values.get(1) === 2 && cose.values.get(3) === -7 && cose.values.get(-1) === 1,
    'Algorithme COSE incorrect.');
  const x = cose.values.get(-2);
  const y = cose.values.get(-3);
  requireCondition(x instanceof Uint8Array && x.length === 32 && y instanceof Uint8Array && y.length === 32,
    'Coordonnées de clé invalides.');
  // Extensions non négociées : pas de données supplémentaires dans la réponse attendue.
  if ((authData[32] & 0x80) === 0) requireCondition(cose.end === authData.length, 'Données COSE supplémentaires.');
  return { id, x, y };
}

function rawIdFromCredential(credential: Credential): Uint8Array {
  requireCondition(credential.type === 'public-key' && 'rawId' in credential
    && (credential as PublicKeyCredential).rawId instanceof ArrayBuffer,
    'Identifiant WebAuthn absent.');
  return new Uint8Array((credential as PublicKeyCredential).rawId);
}

export async function verifyRegistration(
  credential: Credential, challenge: Uint8Array, origin: string, rpId: string,
): Promise<DeviceCredential> {
  const rawId = rawIdFromCredential(credential);
  requireCondition('response' in credential, 'Inscription WebAuthn vide.');
  const response = (credential as PublicKeyCredential).response as AuthenticatorAttestationResponse;
  requireCondition(typeof response.getPublicKey === 'function'
    && typeof response.getPublicKeyAlgorithm === 'function'
    && typeof response.getAuthenticatorData === 'function', 'Inscription WebAuthn incompatible.');
  checkClientData(response.clientDataJSON, 'webauthn.create', challenge, origin);
  requireCondition(response.getPublicKeyAlgorithm() === -7, 'Seul ES256 est accepté.');
  const spki = response.getPublicKey();
  requireCondition(spki !== null, 'Clé WebAuthn indisponible.');
  const authData = new Uint8Array(response.getAuthenticatorData());
  await checkAuthenticatorData(authData, rpId, true);
  const attested = parseAttestedKey(authData);
  requireCondition(sameBytes(rawId, attested.id), 'Identifiant attesté différent.');
  const key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  requireCondition(typeof jwk.x === 'string' && typeof jwk.y === 'string'
    && sameBytes(base64UrlToBytes(jwk.x), attested.x)
    && sameBytes(base64UrlToBytes(jwk.y), attested.y), 'Clé publique attestée incohérente.');
  return {
    version: 1, credentialId: bytesToBase64Url(rawId), publicKeySpki: bytesToBase64Url(new Uint8Array(spki)),
    algorithm: -7, rpId, createdAt: Date.now(),
  };
}

export async function verifyAssertion(
  credential: Credential, stored: DeviceCredential, challenge: Uint8Array, origin: string,
): Promise<boolean> {
  try {
    const id = rawIdFromCredential(credential);
    if (!sameBytes(id, base64UrlToBytes(stored.credentialId)) || stored.algorithm !== -7
      || new URL(origin).hostname !== stored.rpId) return false;
    const response = (credential as PublicKeyCredential).response as AuthenticatorAssertionResponse;
    checkClientData(response.clientDataJSON, 'webauthn.get', challenge, origin);
    const authData = new Uint8Array(response.authenticatorData);
    await checkAuthenticatorData(authData, stored.rpId, false);
    const signed = new Uint8Array(authData.length + 32);
    signed.set(authData);
    signed.set(new Uint8Array(await crypto.subtle.digest('SHA-256', response.clientDataJSON)), authData.length);
    const publicKey = await crypto.subtle.importKey(
      'spki', base64UrlToBytes(stored.publicKeySpki) as BufferSource,
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, publicKey, derEs256ToRaw(response.signature) as BufferSource, signed as BufferSource,
    );
  } catch {
    return false;
  }
}

/** Garde-fou synchronisé avant toute libération d'un budget après WebAuthn.
 * Reste testable sans navigateur, contrairement au dialogue système lui-même. */
export function canCompleteDeviceUnlock(args: {
  generation: number;
  currentGeneration: number;
  phase: 'locked' | 'unlocked' | 'unknown';
  pinValid: boolean;
  currentCredential: DeviceCredential | null;
  storedCredential: DeviceCredential | null;
  expectedCredential: DeviceCredential;
  visible: boolean;
  hiddenAt: number | null;
  hiddenBefore: number | null;
  epochBefore: number;
  epochAfter: number;
}): boolean {
  const a = args;
  return a.generation === a.currentGeneration && a.phase === 'locked' && a.pinValid
    && a.visible && a.hiddenAt === null && a.hiddenBefore === null
    && a.epochBefore === a.epochAfter
    && !!a.currentCredential && !!a.storedCredential
    && a.currentCredential.credentialId === a.expectedCredential.credentialId
    && a.currentCredential.publicKeySpki === a.expectedCredential.publicKeySpki
    && a.storedCredential.credentialId === a.expectedCredential.credentialId
    && a.storedCredential.publicKeySpki === a.expectedCredential.publicKeySpki;
}

export function startDeviceRegistration(rpId: string, oldId?: string) {
  const challenge = randomChallenge();
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: challenge as BufferSource,
    rp: { id: rpId, name: 'Boussole Budget' },
    user: { id: userId as BufferSource, name: 'local', displayName: 'Boussole sur ce téléphone' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged',
    },
    ...(oldId ? { excludeCredentials: [{ type: 'public-key' as const, id: base64UrlToBytes(oldId) as BufferSource }] } : {}),
  };
  return { challenge, request: navigator.credentials.create({ publicKey }) };
}

export function startDeviceAssertion(stored: DeviceCredential) {
  const challenge = randomChallenge();
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: challenge as BufferSource, rpId: stored.rpId, timeout: 60000,
    allowCredentials: [{ type: 'public-key', id: base64UrlToBytes(stored.credentialId) as BufferSource }],
    userVerification: 'required',
  };
  return { challenge, request: navigator.credentials.get({ publicKey }) };
}
