// Verrou d’affichage de Boussole : un code à 6 chiffres, haché sur l’appareil.
// Il empêche l’affichage normal du budget ; il ne chiffre pas les données locales.

export const LOCK_STORAGE_KEY = 'boussole-lock-v1';
/** Horodatage du dernier verrouillage, pour les onglets qui n’ont pas reçu le message. */
export const LOCK_EPOCH_KEY = 'boussole-lock-epoch';
export const PIN_LENGTH = 6;
/** Classe posée sur <html> pour masquer l’interface en arrière-plan. */
export const VEIL_CLASS = 'privacy-veil';
export const PIN_ITERATIONS = 200_000;
export const FREE_ATTEMPTS = 5;
export const FIRST_RETRY_MS = 30_000;
export const MAX_RETRY_MS = 15 * 60_000;

export const LOCK_DELAYS = [0, 60_000, 300_000] as const;
export type LockDelay = (typeof LOCK_DELAYS)[number];

export interface LockConfig {
  version: 1;
  salt: string;
  hash: string;
  iterations: number;
  failedAttempts: number;
  /** Heure (ms) avant laquelle aucun essai n’est accepté. */
  retryAt: number;
  delay: LockDelay;
}

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, material, 256,
  );
  return new Uint8Array(bits);
}

/** Comparaison en temps constant : la durée ne dépend pas de la position de la première différence. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function createLockConfig(pin: string, delay: LockDelay, iterations = PIN_ITERATIONS): Promise<LockConfig> {
  if (!isValidPin(pin)) throw new Error(`Le code doit contenir ${PIN_LENGTH} chiffres.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    version: 1,
    salt: toBase64(salt),
    hash: toBase64(await derive(pin, salt, iterations)),
    iterations,
    failedAttempts: 0,
    retryAt: 0,
    delay,
  };
}

export async function pinMatches(config: LockConfig, pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  return sameBytes(await derive(pin, fromBase64(config.salt), config.iterations), fromBase64(config.hash));
}

/** Attente imposée après `failedAttempts` échecs consécutifs. */
export function retryDelayMs(failedAttempts: number): number {
  if (failedAttempts < FREE_ATTEMPTS) return 0;
  return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** (failedAttempts - FREE_ATTEMPTS));
}

export function registerFailure(config: LockConfig, now: number): LockConfig {
  const failedAttempts = config.failedAttempts + 1;
  const wait = retryDelayMs(failedAttempts);
  return { ...config, failedAttempts, retryAt: wait > 0 ? now + wait : 0 };
}

export function registerSuccess(config: LockConfig): LockConfig {
  return { ...config, failedAttempts: 0, retryAt: 0 };
}

export function shouldLock({ hiddenAt, now, delay }: { hiddenAt: number | null; now: number; delay: number }): boolean {
  return hiddenAt !== null && now - hiddenAt >= delay;
}

export function readLockConfig(storage: Pick<Storage, 'getItem'>): LockConfig | null {
  try {
    const value = JSON.parse(storage.getItem(LOCK_STORAGE_KEY) ?? 'null') as Partial<LockConfig> | null;
    if (!value || value.version !== 1 || typeof value.salt !== 'string' || typeof value.hash !== 'string'
      || !Number.isSafeInteger(value.iterations) || !Number.isSafeInteger(value.failedAttempts)
      || typeof value.retryAt !== 'number' || !LOCK_DELAYS.includes(value.delay as LockDelay)) return null;
    return value as LockConfig;
  } catch {
    return null;
  }
}

export function writeLockConfig(storage: Pick<Storage, 'setItem'>, config: LockConfig): void {
  storage.setItem(LOCK_STORAGE_KEY, JSON.stringify(config));
}
