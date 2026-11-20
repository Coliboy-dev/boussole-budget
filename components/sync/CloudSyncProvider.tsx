'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  decryptText, deriveKey, encryptText, fingerprint, KDF_ITERATIONS, newSalt, passphraseProblem, WrongPassphraseError,
} from '@/lib/cloud-crypto';
import {
  clearStoredKey, cloudClient, cloudConfigured, createVault, deleteCloudAccount, fetchVault, loadStoredKey,
  saveStoredKey, updateVault, type RemoteVault, type StoredKey,
} from '@/lib/cloud-remote';
import { clearSyncMemory, decideSync, readSyncMemory, writeSyncMemory } from '@/lib/cloud-sync';
import { deserializeStoredBudget, serializeBudget } from '@/lib/budget-state';
import { useApp } from '@/lib/context/AppContext';

export type SyncPhase =
  | 'off' // non configurée sur cette version
  | 'loading'
  | 'signed-out'
  | 'needs-passphrase'
  | 'syncing'
  | 'synced'
  | 'conflict'
  | 'error';

interface Account {
  userId: string;
  email: string;
}

interface CloudSyncContext {
  phase: SyncPhase;
  account: Account | null;
  /** Une copie en ligne existe déjà : il faut sa phrase secrète, pas en créer une. */
  remoteExists: boolean;
  lastSyncedAt: Date | null;
  conflictRemoteDate: string | null;
  error: string;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  syncNow: () => Promise<void>;
  resolveConflict: (keep: 'device' | 'cloud') => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const Context = createContext<CloudSyncContext | null>(null);

const PUSH_DELAY_MS = 1500;

export function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const [phase, setPhase] = useState<SyncPhase>(cloudConfigured ? 'loading' : 'off');
  const [account, setAccount] = useState<Account | null>(null);
  const [remoteExists, setRemoteExists] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [conflictRemoteDate, setConflictRemoteDate] = useState<string | null>(null);
  const [error, setError] = useState('');
  const keyRef = useRef<StoredKey | null>(null);
  const busy = useRef(false);
  const again = useRef(false);
  // La dernière version de l’application, lue au moment de synchroniser.
  const appRef = useRef(app);
  useEffect(() => {
    appRef.current = app;
  });

  const localIsEmpty = () => {
    const { needsOnboarding, summary, balanceDate, goals } = appRef.current;
    return needsOnboarding || (summary.emptyBudget && !balanceDate && goals.length === 0);
  };

  const pull = useCallback(async (userId: string, key: StoredKey, remote: RemoteVault) => {
    const plaintext = await decryptText(key.key, remote);
    const { budget } = deserializeStoredBudget(plaintext);
    appRef.current.restoreBudget(budget);
    writeSyncMemory(localStorage, { userId, version: remote.version, fingerprint: await fingerprint(serializeBudget(budget)) });
  }, []);

  const runSync = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return;
    const current = appRef.current;
    if (current.isBudgetLoading || current.storageBlocked || !current.canExportBudget) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    setPhase('syncing');
    setError('');
    const userId = key.userId;

    try {
      const local = current.exportBudget();
      const localFingerprint = await fingerprint(local);
      const remote = await fetchVault(userId);
      setRemoteExists(Boolean(remote));
      const memory = readSyncMemory(localStorage, userId);
      const decision = decideSync({
        remoteVersion: remote?.version ?? null, memory, localFingerprint, localIsEmpty: localIsEmpty(),
      });

      switch (decision.action) {
        case 'idle':
          break;
        case 'create': {
          const version = await createVault(userId, await encryptText(key.key, local), key.salt, key.kdfIterations);
          if (version === null) {
            again.current = true;
            break;
          }
          writeSyncMemory(localStorage, { userId, version, fingerprint: localFingerprint });
          setRemoteExists(true);
          break;
        }
        case 'push': {
          const version = await updateVault(userId, await encryptText(key.key, local), decision.expectedVersion);
          if (version === null) {
            again.current = true;
            break;
          }
          writeSyncMemory(localStorage, { userId, version, fingerprint: localFingerprint });
          break;
        }
        case 'pull':
          await pull(userId, key, remote!);
          break;
        case 'conflict':
          setConflictRemoteDate(remote?.updatedAt ?? null);
          setPhase('conflict');
          return;
      }
      setConflictRemoteDate(null);
      setLastSyncedAt(new Date());
      setPhase('synced');
    } catch (caught) {
      if (caught instanceof WrongPassphraseError) {
        // La copie en ligne a été recréée avec une autre phrase secrète.
        keyRef.current = null;
        await clearStoredKey();
        setPhase('needs-passphrase');
        setError('La copie en ligne utilise une autre phrase secrète. Saisis-la pour continuer.');
      } else {
        setPhase('error');
        setError(caught instanceof Error ? caught.message : 'La synchronisation a échoué.');
      }
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        window.setTimeout(() => void runSync(), 300);
      }
    }
  }, [pull]);

  // Session et trousseau au démarrage, puis à chaque connexion ou déconnexion.
  useEffect(() => {
    if (!cloudConfigured) return;
    const supabase = cloudClient();
    let cancelled = false;

    async function adopt(userId: string | null, email: string | null) {
      if (cancelled) return;
      if (!userId) {
        keyRef.current = null;
        setAccount(null);
        setPhase('signed-out');
        return;
      }
      setAccount({ userId, email: email ?? '' });
      const stored = await loadStoredKey(userId);
      if (cancelled) return;
      keyRef.current = stored;
      if (stored) {
        void runSync();
      } else {
        setPhase('needs-passphrase');
        try {
          setRemoteExists(Boolean(await fetchVault(userId)));
        } catch {
          setRemoteExists(false);
        }
      }
    }

    void supabase.auth.getSession().then(({ data }) => adopt(data.session?.user.id ?? null, data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        void adopt(session?.user.id ?? null, session?.user.email ?? null);
      }
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [runSync]);

  // Envoi automatique peu après chaque modification du budget.
  const lastSeen = useRef<string | null>(null);
  useEffect(() => {
    if (!keyRef.current || !app.canExportBudget || app.isBudgetLoading) return;
    let snapshot: string;
    try {
      snapshot = app.exportBudget();
    } catch {
      return;
    }
    if (snapshot === lastSeen.current) return;
    const first = lastSeen.current === null;
    lastSeen.current = snapshot;
    if (first) return;
    const timer = window.setTimeout(() => void runSync(), PUSH_DELAY_MS);
    return () => window.clearTimeout(timer);
  });

  // Récupération à chaque retour sur l’application et au retour du réseau.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSync();
    };
    const onOnline = () => void runSync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [runSync]);

  async function sendCode(email: string) {
    setError('');
    const { error: authError } = await cloudClient().auth.signInWithOtp({
      email: email.trim(), options: { shouldCreateUser: true },
    });
    if (authError) {
      throw new Error(authError.status === 429
        ? 'Trop de demandes de code. Patiente quelques minutes avant de réessayer.'
        : 'Le code n’a pas pu être envoyé. Vérifie l’adresse e-mail.');
    }
  }

  async function verifyCode(email: string, code: string) {
    setError('');
    const { error: authError } = await cloudClient().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (authError) throw new Error('Code incorrect ou expiré. Demande un nouveau code.');
  }

  async function unlock(passphrase: string) {
    if (!account) throw new Error('Connecte-toi d’abord.');
    setError('');
    const remote = await fetchVault(account.userId);
    if (!remote) {
      const problem = passphraseProblem(passphrase);
      if (problem) throw new Error(problem);
    }
    const salt = remote?.salt ?? newSalt();
    const kdfIterations = remote?.kdfIterations ?? KDF_ITERATIONS;
    const key = await deriveKey(passphrase, salt, kdfIterations);
    if (remote) await decryptText(key, remote); // Vérifie la phrase avant de la garder.
    const stored: StoredKey = { userId: account.userId, key, salt, kdfIterations };
    await saveStoredKey(stored);
    keyRef.current = stored;
    setRemoteExists(Boolean(remote));
    await runSync();
  }

  async function resolveConflict(keep: 'device' | 'cloud') {
    const key = keyRef.current;
    if (!key) return;
    setPhase('syncing');
    try {
      const remote = await fetchVault(key.userId);
      if (keep === 'cloud' && remote) {
        await pull(key.userId, key, remote);
      } else {
        const local = appRef.current.exportBudget();
        const encrypted = await encryptText(key.key, local);
        const version = remote
          ? await updateVault(key.userId, encrypted, remote.version)
          : await createVault(key.userId, encrypted, key.salt, key.kdfIterations);
        if (version === null) throw new Error('La copie en ligne vient encore de changer. Réessaie.');
        writeSyncMemory(localStorage, { userId: key.userId, version, fingerprint: await fingerprint(local) });
      }
      setConflictRemoteDate(null);
      setLastSyncedAt(new Date());
      setPhase('synced');
    } catch (caught) {
      setPhase('conflict');
      setError(caught instanceof Error ? caught.message : 'Le choix n’a pas pu être appliqué.');
    }
  }

  async function forgetDevice() {
    keyRef.current = null;
    await clearStoredKey();
    clearSyncMemory(localStorage);
    setLastSyncedAt(null);
    setConflictRemoteDate(null);
  }

  async function signOut() {
    await forgetDevice();
    await cloudClient().auth.signOut({ scope: 'local' });
    setAccount(null);
    setPhase('signed-out');
  }

  async function deleteAccount() {
    await deleteCloudAccount();
    await signOut();
  }

  const value: CloudSyncContext = {
    phase, account, remoteExists, lastSyncedAt, conflictRemoteDate, error,
    sendCode, verifyCode, unlock, syncNow: runSync, resolveConflict, signOut, deleteAccount,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCloudSync(): CloudSyncContext {
  const context = useContext(Context);
  if (!context) throw new Error('useCloudSync doit être utilisé dans CloudSyncProvider');
  return context;
}
