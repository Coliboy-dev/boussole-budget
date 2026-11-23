import type { HouseholdKey } from './household-key.ts';
import type { HouseholdQueue } from './household-sync.ts';

export interface HouseholdListing {
  id: string;
  keyVersion: number;
  createdAt: string;
  memberId?: string;
  activeMemberIds?: string[];
}

/** Foyer dont ce compte n'est plus membre : sa copie chiffrée reste sur l'appareil, sans synchronisation. */
export interface FormerHousehold {
  id: string;
  leftAt: string;
}

export interface HouseholdDirectory {
  selected: string | null;
  households: HouseholdListing[];
  former?: FormerHousehold[];
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

/**
 * Remplace les adhésions actives sans perdre les anciens foyers. Un foyer qui disparaît de la liste (départ,
 * partage arrêté par l'autre membre) devient « ancien » ; un foyer rejoint à nouveau ne l'est plus.
 */
export function mergeHouseholdDirectory(
  current: HouseholdDirectory, households: HouseholdListing[], now: string,
): HouseholdDirectory {
  const active = new Set(households.map(({ id }) => id));
  const known = new Set((current.former ?? []).map(({ id }) => id));
  const former = [
    ...(current.former ?? []),
    ...current.households.filter(({ id }) => !active.has(id) && !known.has(id)).map(({ id }) => ({ id, leftAt: now })),
  ].filter(({ id }) => !active.has(id));
  return {
    households,
    selected: current.selected && active.has(current.selected) ? current.selected : null,
    ...(former.length > 0 && { former }),
  };
}

export function withFormerHousehold(directory: HouseholdDirectory, id: string, leftAt: string): HouseholdDirectory {
  const former = [...(directory.former ?? []).filter((entry) => entry.id !== id), { id, leftAt }];
  return {
    households: directory.households.filter((household) => household.id !== id),
    selected: directory.selected === id ? null : directory.selected,
    former,
  };
}

/**
 * Après un départ ou un retrait : la synchronisation s'arrête (cache marqué retiré) et la copie chiffrée,
 * sa clé et les modifications non envoyées restent sur l'appareil. Rien n'est effacé.
 */
export async function keepFormerHouseholdCopy(userId: string, householdId: string, leftAt: string): Promise<HouseholdDirectory> {
  const cached = await readHouseholdCache(userId, householdId);
  if (cached) await updateHouseholdCache(userId, householdId, (current) => ({ ...(current ?? cached), revoked: true }));
  return householdDirectory(userId, (directory) => withFormerHousehold(directory, householdId, leftAt));
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
