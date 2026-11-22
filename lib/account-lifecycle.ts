// Effacement local de Boussole : chaque étape est vérifiée, aucune réussite
// n’est annoncée après un effacement partiel.

import { ACCOUNT_OWNER_KEY } from './account-guard.ts';
import { BUDGET_STORAGE_KEY, LEGACY_BUDGET_STORAGE_KEY } from './budget-state.ts';
import { SYNC_MEMORY_KEY } from './cloud-sync.ts';
import { PENDING_VAULT_KEY } from './vault-pending.ts';

/** Toutes les clés que Boussole enregistre dans le navigateur. */
export const LOCAL_STORAGE_KEYS = [
  BUDGET_STORAGE_KEY,
  LEGACY_BUDGET_STORAGE_KEY,
  SYNC_MEMORY_KEY,
  PENDING_VAULT_KEY,
  ACCOUNT_OWNER_KEY,
  'boussole-lock-v1',
  'boussole-lock-device-v1',
  'boussole-lock-epoch',
  'boussole-payment-reminders',
  'boussole-security-event',
  'boussole-auth',
] as const;

export interface EraseResult {
  ok: boolean;
  /** Ce qui n’a pas pu être supprimé. */
  failed: string[];
}

interface EraseDependencies {
  storage: Pick<Storage, 'getItem' | 'removeItem'>;
  /** Supprime le trousseau de clés de chiffrement et rejette en cas d’échec. */
  deleteKeyStore: () => Promise<void>;
}

export async function eraseLocalData({ storage, deleteKeyStore }: EraseDependencies): Promise<EraseResult> {
  const failed: string[] = [];
  for (const key of LOCAL_STORAGE_KEYS) {
    // Un budget qui a résisté à l’effacement conserve ses preuves de rattachement.
    if ((key === ACCOUNT_OWNER_KEY || key === SYNC_MEMORY_KEY || key === PENDING_VAULT_KEY)
      && (failed.includes(BUDGET_STORAGE_KEY) || failed.includes(LEGACY_BUDGET_STORAGE_KEY))) continue;
    try {
      storage.removeItem(key);
      if (storage.getItem(key) !== null) failed.push(key);
    } catch {
      failed.push(key);
    }
  }
  try {
    await deleteKeyStore();
  } catch {
    failed.push('trousseau de chiffrement');
  }
  return { ok: failed.length === 0, failed };
}
