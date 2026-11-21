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

/**
 * Trois états distincts : aucun verrou, verrou valide, réglage illisible.
 * Un réglage illisible ne vaut jamais « pas de verrou » : Boussole reste verrouillé.
 */
export type LockState =
  | { status: 'absent' }
  | { status: 'valid'; config: LockConfig }
  | { status: 'unreadable' };

function isLockConfig(value: unknown): value is LockConfig {
  const candidate = value as Partial<LockConfig> | null;
  return Boolean(candidate) && typeof candidate === 'object' && candidate!.version === 1
    && typeof candidate!.salt === 'string' && candidate!.salt.length > 0
    && typeof candidate!.hash === 'string' && candidate!.hash.length > 0
    && Number.isSafeInteger(candidate!.iterations) && candidate!.iterations! > 0
    && Number.isSafeInteger(candidate!.failedAttempts) && candidate!.failedAttempts! >= 0
    && typeof candidate!.retryAt === 'number' && Number.isFinite(candidate!.retryAt)
    && LOCK_DELAYS.includes(candidate!.delay as LockDelay);
}

export function readLockState(storage: Pick<Storage, 'getItem'>): LockState {
  let raw: string | null;
  try {
    raw = storage.getItem(LOCK_STORAGE_KEY);
  } catch {
    return { status: 'unreadable' };
  }
  if (raw === null) return { status: 'absent' };
  try {
    const value: unknown = JSON.parse(raw);
    return isLockConfig(value) ? { status: 'valid', config: value } : { status: 'unreadable' };
  } catch {
    return { status: 'unreadable' };
  }
}

/**
 * Que faire au retour dans l’app (ou à un message d’un autre onglet).
 * - `unlock` : plus aucun verrou, afficher le budget ;
 * - `show-lock` : afficher l’écran du code ; si on y est déjà, il ne contient aucun montant et le voile se retire ;
 * - `unveil` : rester déverrouillé et retirer le voile.
 */
export function returnDecision({ phase, state, hiddenAt, now, lockEpoch, unlockedAt }: {
  phase: 'locked' | 'unlocked';
  state: LockState;
  hiddenAt: number | null;
  now: number;
  lockEpoch: number;
  unlockedAt: number;
}): 'unlock' | 'show-lock' | 'unveil' {
  if (state.status === 'absent') return phase === 'locked' ? 'unlock' : 'unveil';
  if (state.status === 'unreadable' || phase === 'locked') return 'show-lock';
  if (shouldLock({ hiddenAt, now, delay: state.config.delay }) || lockEpoch > unlockedAt) return 'show-lock';
  return 'unveil';
}

/**
 * Faut-il garder le voile après la décision de retour ?
 * Seulement si l’écran du code n’est pas encore affiché : c’est lui qui le retirera après son rendu.
 * S’il est déjà affiché (app déjà verrouillée), le voile doit partir tout de suite, sinon l’écran reste vert.
 */
export function keepVeil(decision: 'unlock' | 'show-lock' | 'unveil', phaseBefore: 'locked' | 'unlocked'): boolean {
  return decision === 'show-lock' && phaseBefore === 'unlocked';
}

export function writeLockConfig(storage: Pick<Storage, 'setItem'>, config: LockConfig): void {
  storage.setItem(LOCK_STORAGE_KEY, JSON.stringify(config));
}
