import type { HouseholdKey } from './household-key.ts';
import type { HouseholdQueue } from './household-sync.ts';

export interface HouseholdListing {
  id: string;
  keyVersion: number;
  createdAt: string;
  memberId?: string;
}

export interface HouseholdDirectory {
  selected: string | null;
  households: HouseholdListing[];
}

export type StoredHousehold = HouseholdKey & HouseholdQueue & { revoked?: true };

// Le coffre personnel utilise le même trousseau. L’effacement de l’appareil efface aussi ces entrées.
const database = 'boussole-cloud';
const store = 'keys';

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function entry<T>(id: string, update?: (value: T | undefined) => T): Promise<T | undefined> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(store, update ? 'readwrite' : 'readonly');
      const records = transaction.objectStore(store);
      const request = records.get(id);
      let value: T | undefined;
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(transaction.error ?? new Error('Stockage du foyer indisponible.'));
      request.onsuccess = () => {
        try {
          value = request.result as T | undefined;
          if (update) {
            value = update(value);
            records.put(value, id);
          }
        } catch (error) {
          reject(error);
          transaction.abort();
        }
      };
    });
  } finally {
    db.close();
  }
}

export const emptyDirectory: HouseholdDirectory = { selected: null, households: [] };
export const emptyHouseholdQueue: HouseholdQueue = { cursor: 0, confirmed: [], pending: [] };

export async function householdDirectory(userId: string, update?: (directory: HouseholdDirectory) => HouseholdDirectory) {
  return await entry<HouseholdDirectory>(`household-directory:${userId}`, update && (current => update(current ?? emptyDirectory)))
    ?? emptyDirectory;
}

export function readHouseholdCache(userId: string, householdId: string): Promise<StoredHousehold | undefined> {
  return entry<StoredHousehold>(`household-v1:${userId}:${householdId}`);
}

export function updateHouseholdCache(
  userId: string, householdId: string, update: (current: StoredHousehold | undefined) => StoredHousehold,
): Promise<StoredHousehold> {
  return entry<StoredHousehold>(`household-v1:${userId}:${householdId}`, update)
    .then((current) => current!);
}
