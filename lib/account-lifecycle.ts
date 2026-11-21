// Effacement local de Boussole : chaque étape est vérifiée, aucune réussite
// n’est annoncée après un effacement partiel.

/** Toutes les clés que Boussole enregistre dans le navigateur. */
export const LOCAL_STORAGE_KEYS = [
  'boussole-budget-v2',
  'boussole-budget-v1',
  'boussole-sync-v1',
  'boussole-lock-v1',
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
