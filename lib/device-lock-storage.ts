// Référence PUBLIQUE d'un credential WebAuthn. Indépendante du PIN Boussole.
// La clé privée est conservée uniquement par l'authentificateur / gestionnaire de passkeys.
export const DEVICE_LOCK_STORAGE_KEY = 'boussole-lock-device-v1';

export interface DeviceCredential {
  version: 1;
  credentialId: string; // base64url rawId
  publicKeySpki: string; // base64url SubjectPublicKeyInfo ES256 P-256
  algorithm: -7;
  rpId: string;
  createdAt: number;
}

export type DeviceLockState =
  | { status: 'absent' }
  | { status: 'invalid' }
  | { status: 'valid'; credential: DeviceCredential };

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1 || encoded.length > 4096) {
    throw new Error('Encodage de credential invalide.');
  }
  const text = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(text.padEnd(Math.ceil(text.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
  if (bytesToBase64Url(bytes) !== encoded) throw new Error('Encodage de credential non canonique.');
  return bytes;
}

function isCredential(candidate: unknown): candidate is DeviceCredential {
  if (!candidate || typeof candidate !== 'object') return false;
  const c = candidate as Partial<DeviceCredential>;
  if (c.version !== 1 || c.algorithm !== -7 || !Number.isSafeInteger(c.createdAt)
    || typeof c.credentialId !== 'string' || typeof c.publicKeySpki !== 'string'
    || typeof c.rpId !== 'string' || c.rpId.length < 1 || c.rpId.length > 253
    || !/^[a-z0-9.-]+$/.test(c.rpId)) return false;
  try {
    const id = base64UrlToBytes(c.credentialId);
    const spki = base64UrlToBytes(c.publicKeySpki);
    return id.length >= 16 && id.length <= 512 && spki.length >= 70 && spki.length <= 200;
  } catch {
    return false;
  }
}

export function readDeviceLock(storage: Pick<Storage, 'getItem'>, rpId: string): DeviceLockState {
  try {
    const raw = storage.getItem(DEVICE_LOCK_STORAGE_KEY);
    if (raw === null) return { status: 'absent' };
    const candidate: unknown = JSON.parse(raw);
    if (!isCredential(candidate) || candidate.rpId !== rpId) return { status: 'invalid' };
    return { status: 'valid', credential: candidate };
  } catch {
    return { status: 'invalid' };
  }
}

export function saveDeviceLock(storage: Pick<Storage, 'setItem' | 'getItem'>, credential: DeviceCredential): void {
  if (!isCredential(credential)) throw new Error('Configuration WebAuthn invalide.');
  storage.setItem(DEVICE_LOCK_STORAGE_KEY, JSON.stringify(credential));
  const reread = readDeviceLock(storage, credential.rpId);
  if (reread.status !== 'valid' || JSON.stringify(reread.credential) !== JSON.stringify(credential)) {
    throw new Error('Le déverrouillage avec le téléphone n’a pas pu être enregistré.');
  }
}

export function removeDeviceLock(storage: Pick<Storage, 'getItem' | 'removeItem'>): void {
  storage.removeItem(DEVICE_LOCK_STORAGE_KEY);
  if (storage.getItem(DEVICE_LOCK_STORAGE_KEY) !== null) {
    throw new Error('La méthode du téléphone n’a pas pu être désactivée.');
  }
}
