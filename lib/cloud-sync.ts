// Décision de synchronisation, sans réseau ni navigateur : testable seule.
// Le budget local et la copie en ligne sont comparés à l’état de la dernière
// synchronisation réussie sur cet appareil. Rien n’est jamais écrasé en silence :
// si les deux ont changé, la personne choisit.

export const SYNC_MEMORY_KEY = 'boussole-sync-v1';

export interface SyncMemory {
  userId: string;
  /** Version de la copie en ligne lors de la dernière synchronisation réussie. */
  version: number;
  /** Empreinte du budget local à ce moment-là. */
  fingerprint: string;
}

export type SyncDecision =
  | { action: 'idle' }
  | { action: 'create' }
  | { action: 'push'; expectedVersion: number }
  | { action: 'pull' }
  | { action: 'conflict' };

interface SyncInput {
  /** Version de la copie en ligne, ou null s’il n’y en a pas encore. */
  remoteVersion: number | null;
  memory: SyncMemory | null;
  localFingerprint: string;
  /** Aucun budget saisi sur cet appareil : récupérer la copie en ligne ne perd rien. */
  localIsEmpty: boolean;
}

export function decideSync({ remoteVersion, memory, localFingerprint, localIsEmpty }: SyncInput): SyncDecision {
  if (remoteVersion === null) return localIsEmpty ? { action: 'idle' } : { action: 'create' };

  if (memory && memory.version === remoteVersion) {
    return localFingerprint === memory.fingerprint
      ? { action: 'idle' }
      : { action: 'push', expectedVersion: remoteVersion };
  }

  // La copie en ligne a changé depuis la dernière synchronisation de cet appareil,
  // ou cet appareil ne s’est jamais synchronisé.
  if (localIsEmpty) return { action: 'pull' };
  if (memory && localFingerprint === memory.fingerprint) return { action: 'pull' };
  return { action: 'conflict' };
}

export function readSyncMemory(storage: Pick<Storage, 'getItem'>, userId: string): SyncMemory | null {
  try {
    const value = JSON.parse(storage.getItem(SYNC_MEMORY_KEY) ?? 'null') as Partial<SyncMemory> | null;
    if (!value || value.userId !== userId || !Number.isInteger(value.version) || typeof value.fingerprint !== 'string') {
      return null;
    }
    return { userId, version: value.version as number, fingerprint: value.fingerprint };
  } catch {
    return null;
  }
}

export function writeSyncMemory(storage: Pick<Storage, 'setItem'>, memory: SyncMemory): void {
  storage.setItem(SYNC_MEMORY_KEY, JSON.stringify(memory));
}

export function clearSyncMemory(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(SYNC_MEMORY_KEY);
}
