// Chiffrement de bout en bout du budget avant tout envoi vers le serveur.
// AES-GCM 256 bits, clé dérivée de la phrase secrète par PBKDF2-SHA-256.
// La phrase secrète et la clé ne quittent jamais l’appareil.

export const KDF_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 12;

export interface EncryptedBudget {
  ciphertext: string;
  iv: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function subtle(): SubtleCrypto {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) throw new Error('Ce navigateur ne permet pas de chiffrer le budget.');
  return crypto.subtle;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export function newSalt(): string {
  return toBase64(randomBytes(16));
}

export function passphraseProblem(passphrase: string): string | undefined {
  if (passphrase.trim().length < MIN_PASSPHRASE_LENGTH) {
    return `Choisis une phrase secrète d’au moins ${MIN_PASSPHRASE_LENGTH} caractères.`;
  }
  return undefined;
}

/** Clé non exportable : elle peut être gardée sur l’appareil sans pouvoir être lue. */
export async function deriveKey(passphrase: string, salt: string, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', encoder.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(key: CryptoKey, plaintext: string): Promise<EncryptedBudget> {
  const iv = randomBytes(12);
  const encrypted = await subtle().encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Phrase secrète incorrecte. Le budget en ligne n’a pas pu être déchiffré.');
    this.name = 'WrongPassphraseError';
  }
}

export async function decryptText(key: CryptoKey, { ciphertext, iv }: EncryptedBudget): Promise<string> {
  try {
    const decrypted = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(ciphertext));
    return decoder.decode(decrypted);
  } catch {
    // AES-GCM authentifie le contenu : une mauvaise clé ou un bloc modifié échouent ici.
    throw new WrongPassphraseError();
  }
}

/** Empreinte du budget pour savoir s’il a changé depuis la dernière synchronisation. */
export async function fingerprint(text: string): Promise<string> {
  const digest = await subtle().digest('SHA-256', encoder.encode(text));
  return toBase64(new Uint8Array(digest));
}
