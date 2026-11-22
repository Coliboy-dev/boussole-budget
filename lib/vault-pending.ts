export const PENDING_VAULT_KEY = 'boussole-vault-pending-v1';
const MAX_PENDING_FINGERPRINTS = 10;

export interface PendingVault {
  userId: string;
  fingerprints: string[];
}

function isFingerprint(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function readPendingVault(storage: Pick<Storage, 'getItem'>): PendingVault | null | 'unreadable' {
  try {
    const raw = storage.getItem(PENDING_VAULT_KEY);
    if (raw === null) return null;
    const record = JSON.parse(raw);
    if (typeof record?.userId === 'string' && record.userId.trim()) {
      const fingerprints: unknown = record.fingerprints;
      if (Array.isArray(fingerprints) && fingerprints.every(isFingerprint)) {
        return { userId: record.userId, fingerprints: fingerprints.slice(-MAX_PENDING_FINGERPRINTS) };
      }
      if (fingerprints === undefined && isFingerprint(record.fingerprint)) {
        return { userId: record.userId, fingerprints: [record.fingerprint] };
      }
    }
  } catch {
    return 'unreadable';
  }
  return 'unreadable';
}

export function rememberVaultFingerprint(pending: PendingVault, fingerprint: string): PendingVault {
  const previous = pending.fingerprints.filter((entry) => entry !== fingerprint);
  return { ...pending, fingerprints: [...previous, fingerprint].slice(-MAX_PENDING_FINGERPRINTS) };
}

export function matchesInitialVault(remoteFingerprint: string, localFingerprint: string, pending: PendingVault): boolean {
  return remoteFingerprint === localFingerprint || pending.fingerprints.includes(remoteFingerprint);
}
