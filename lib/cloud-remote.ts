// Accès à Supabase et au trousseau de l’appareil. Navigateur uniquement.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EncryptedBudget } from './cloud-crypto.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const cloudConfigured = Boolean(url && publishableKey);

let client: SupabaseClient | null = null;

export function cloudClient(): SupabaseClient {
  if (!url || !publishableKey) throw new Error('La synchronisation n’est pas configurée sur cette version.');
  client ??= createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'boussole-auth' },
  });
  return client;
}

export interface RemoteVault extends EncryptedBudget {
  version: number;
  salt: string;
  kdfIterations: number;
  updatedAt: string;
}

interface VaultRow {
  version: number;
  ciphertext: string;
  iv: string;
  salt: string;
  kdf_iterations: number;
  updated_at: string;
}

function networkError(message: string): Error {
  return new Error(`${message} Vérifie ta connexion et réessaie.`);
}

export async function fetchVault(userId: string): Promise<RemoteVault | null> {
  const { data, error } = await cloudClient()
    .from('budget_vaults')
    .select('version, ciphertext, iv, salt, kdf_iterations, updated_at')
    .eq('user_id', userId)
    .maybeSingle<VaultRow>();
  if (error) throw networkError('La copie en ligne n’a pas pu être lue.');
  if (!data) return null;
  return {
    version: data.version,
    ciphertext: data.ciphertext,
    iv: data.iv,
    salt: data.salt,
    kdfIterations: data.kdf_iterations,
    updatedAt: data.updated_at,
  };
}

/** Première copie en ligne. Renvoie null si une autre copie a été créée entre-temps. */
export async function createVault(
  userId: string, encrypted: EncryptedBudget, salt: string, kdfIterations: number,
): Promise<number | null> {
  const { error } = await cloudClient().from('budget_vaults').insert({
    user_id: userId, version: 1, ciphertext: encrypted.ciphertext, iv: encrypted.iv, salt, kdf_iterations: kdfIterations,
  });
  if (error?.code === '23505') return null;
  if (error) throw networkError('La copie en ligne n’a pas pu être créée.');
  return 1;
}

/** Remplace la copie en ligne seulement si personne ne l’a modifiée depuis `expectedVersion`. */
export async function updateVault(userId: string, encrypted: EncryptedBudget, expectedVersion: number): Promise<number | null> {
  const { data, error } = await cloudClient()
    .from('budget_vaults')
    .update({ ciphertext: encrypted.ciphertext, iv: encrypted.iv, version: expectedVersion + 1 })
    .eq('user_id', userId)
    .eq('version', expectedVersion)
    .select('version');
  if (error) throw networkError('La copie en ligne n’a pas pu être mise à jour.');
  return data && data.length === 1 ? (data[0] as { version: number }).version : null;
}

export async function deleteCloudAccount(): Promise<void> {
  const { error } = await cloudClient().rpc('delete_my_account');
  if (error) throw networkError('Le compte en ligne n’a pas pu être supprimé.');
}

// Trousseau : la clé dérivée, non exportable, est gardée dans IndexedDB pour éviter
// de redemander la phrase secrète à chaque ouverture. Elle ne peut pas être lue en clair.

export interface StoredKey {
  userId: string;
  key: CryptoKey;
  salt: string;
  kdfIterations: number;
}

const DB_NAME = 'boussole-cloud';
const STORE = 'keys';
const KEY_ID = 'budget';

function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openKeyStore();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadStoredKey(userId: string): Promise<StoredKey | null> {
  try {
    const stored = await withStore<StoredKey | undefined>('readonly', (store) => store.get(KEY_ID));
    return stored && stored.userId === userId ? stored : null;
  } catch {
    return null;
  }
}

export async function saveStoredKey(stored: StoredKey): Promise<void> {
  await withStore('readwrite', (store) => store.put(stored, KEY_ID));
}

/** Supprime tout le trousseau ; rejette si la suppression échoue ou reste bloquée. */
export function deleteKeyStore(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase(DB_NAME);
    let timer: ReturnType<typeof setTimeout> | undefined;
    request.onsuccess = () => {
      clearTimeout(timer);
      resolve();
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error ?? new Error('Suppression du trousseau impossible.'));
    };
    // Une connexion ouverte ailleurs retarde la suppression : elle aboutit quand elle se ferme.
    request.onblocked = () => {
      timer = setTimeout(() => reject(new Error('Le trousseau est encore ouvert dans un autre onglet.')), 3000);
    };
  });
}

export async function clearStoredKey(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(KEY_ID));
  } catch {
    // Rien à effacer.
  }
}
