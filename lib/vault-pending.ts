export const PENDING_VAULT_KEY = 'boussole-vault-pending-v1';

export interface PendingVault {
  userId: string;
  fingerprint: string;
}

export function readPendingVault(storage: Pick<Storage, 'getItem'>): PendingVault | null | 'unreadable' {
  try {
    const raw = storage.getItem(PENDING_VAULT_KEY);
    if (raw === null) return null;
    const record = JSON.parse(raw);
    if (typeof record?.userId === 'string' && record.userId.trim()
      && typeof record.fingerprint === 'string' && record.fingerprint.trim()) {
      return { userId: record.userId, fingerprint: record.fingerprint };
    }
  } catch {
    return 'unreadable';
  }
  return 'unreadable';
}

export function matchesInitialVault(remoteFingerprint: string, localFingerprint: string, pending: PendingVault): boolean {
  return remoteFingerprint === localFingerprint || remoteFingerprint === pending.fingerprint;
}
