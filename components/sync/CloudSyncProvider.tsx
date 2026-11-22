'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import {
  ACCOUNT_OWNER_KEY, ACCOUNT_TRANSITION_LOCK, AUTH_STORAGE_KEY, accountGuard, isPristineBudget,
  readBudgetOwner, readExpiredSession, readStoredSessionUserId, type BudgetOwner, type OwnerStatus,
} from '@/lib/account-guard';
import { canAccessBudget, publishBudgetAccess } from '@/lib/budget-access';
import {
  decryptText, deriveKey, encryptText, fingerprint, KDF_ITERATIONS, newSalt, passphraseProblem, WrongPassphraseError,
} from '@/lib/cloud-crypto';
import {
  clearStoredKey, cloudClient, cloudConfigured, createVault, deleteCloudAccount, fetchManagedVaultKey, fetchVault, loadStoredKey,
  managedBackupsEnabled,
  saveStoredKey, updateVault, type RemoteVault, type StoredKey,
} from '@/lib/cloud-remote';
import { clearSyncMemory, decideSync, readSyncMemory, writeSyncMemory } from '@/lib/cloud-sync';
import {
  deserializeStoredBudget, emptyBudgetState, LEGACY_BUDGET_STORAGE_KEY, migrateLegacyBudget, readBudgetSnapshot,
  serializeBudget, writeBudgetSnapshot, type BudgetStorageSnapshot,
} from '@/lib/budget-state';
import { useApp } from '@/lib/context/AppContext';
import { passwordProblem } from '@/lib/account-password';
import { todayInBrussels } from '@/lib/local-date';
import type { FirstBudgetInput } from '@/lib/onboarding';
import { matchesInitialVault, PENDING_VAULT_KEY, readPendingVault, rememberVaultFingerprint } from '@/lib/vault-pending';

export const accountSignupEnabled = cloudConfigured && process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_ENABLED === 'true';

export type SyncPhase =
  | 'off'
  | 'loading'
  | 'signed-out'
  | 'needs-passphrase'
  | 'awaiting-association'
  | 'first-budget'
  | 'vault-pending'
  | 'local-only'
  | 'account-mismatch'
  | 'account-error'
  | 'syncing'
  | 'synced'
  | 'conflict'
  | 'error';

interface Account {
  userId: string;
  email: string;
}

type AssociationAction = 'attach' | 'restore' | 'start-empty';

interface Association {
  key: StoredKey;
  version: number | null;
  owner: OwnerStatus;
  snapshot: BudgetStorageSnapshot;
  legacy: string | null;
  empty: boolean;
  contents: string;
}

interface CloudSyncContext {
  phase: SyncPhase;
  account: Account | null;
  remoteExists: boolean | null;
  associationEmpty: boolean;
  otpEmail: string;
  lastSyncedAt: Date | null;
  conflictRemoteDate: string | null;
  error: string;
  signingUp: boolean;
  /** Connexion par code e-mail réussie dans cet onglet : le mot de passe doit être choisi. */
  passwordRequired: boolean;
  /** Connexion récente sur cet appareil : proposer une fois le verrou (code et Face ID). */
  offerDeviceLock: boolean;
  dismissDeviceLockOffer: () => void;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  setPassword: (password: string) => Promise<void>;
  firstBudgetResult: boolean;
  initialVaultConfirmed: boolean;
  beginSignIn: (createAccount: boolean) => void;
  finishAccountBudget: (input: FirstBudgetInput) => Promise<void>;
  dismissFirstBudgetResult: () => void;
  resumeVault: () => Promise<void>;
  sendCode: (email: string) => Promise<void>;
  resetCode: () => void;
  verifyCode: (email: string, code: string) => Promise<void>;
  refreshAccount: () => Promise<void>;
  unlock: (passphrase: string, savedPassphrase?: boolean) => Promise<void>;
  associate: (action: AssociationAction) => Promise<void>;
  syncNow: () => Promise<void>;
  resolveConflict: (keep: 'device' | 'cloud') => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const Context = createContext<CloudSyncContext | null>(null);
const PUSH_DELAY_MS = 1500;
const changedAccount = 'Le compte actif a changé. Vérifie ta connexion et réessaie.';
const changedBudget = 'Le budget a changé depuis l’affichage de ce choix. Vérifie de nouveau avant de continuer.';
const unreadableVault = 'La copie en ligne n’a pas pu être ouverte.';
const vaultFromAnotherDevice = 'Ton compte a déjà une copie en ligne créée sur un autre appareil. Saisis ta phrase secrète pour la comparer.';

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function assertSession(userId: string | null) {
  if (readStoredSessionUserId(localStorage) !== userId) throw new Error(changedAccount);
}

function canAssociate(owner: OwnerStatus, userId: string) {
  return owner.type === 'guest' || (owner.type === 'transition' && owner.userId === userId);
}

function sameOwner(a: OwnerStatus, b: OwnerStatus) {
  return a.type === b.type && ('userId' in a ? 'userId' in b && a.userId === b.userId : true);
}

function matchesVaultKey(key: StoredKey, remote: RemoteVault) {
  return (key.keyMode ?? 'legacy') === remote.keyMode && key.salt === remote.salt && key.kdfIterations === remote.kdfIterations;
}

async function withAccountTransition<T>(action: () => T | Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error('Ce navigateur ne permet pas de changer de compte en toute sécurité.');
  return navigator.locks.request(ACCOUNT_TRANSITION_LOCK, action);
}

function hasStalePendingVault() {
  const pending = readPendingVault(localStorage);
  if (pending === null) return false;
  const owner = readBudgetOwner(localStorage);
  return (owner.type !== 'account' && owner.type !== 'transition')
    || (pending !== 'unreadable' && pending.userId !== owner.userId);
}

function discardStalePendingVault() {
  if (hasStalePendingVault()) localStorage.removeItem(PENDING_VAULT_KEY);
}

async function initializeOwner() {
  const ownerExists = localStorage.getItem(ACCOUNT_OWNER_KEY) !== null;
  if (!navigator.locks || (ownerExists && !hasStalePendingVault())) return;
  await withAccountTransition(() => {
    discardStalePendingVault();
    if (localStorage.getItem(ACCOUNT_OWNER_KEY) !== null) return;
    // La production ne compte aucun compte avant C0. Les restes d’une connexion de test sont locaux.
    clearSyncMemory(localStorage);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.setItem(ACCOUNT_OWNER_KEY, JSON.stringify({ type: 'guest' }));
  });
}

function prepareAssociation(key: StoredKey, remote: RemoteVault | null): Association {
  const owner = readBudgetOwner(localStorage);
  if (!canAssociate(owner, key.userId)) throw new Error(changedAccount);
  const snapshot = readBudgetSnapshot(localStorage);
  const legacy = localStorage.getItem(LEGACY_BUDGET_STORAGE_KEY);
  const budget = snapshot.current !== null ? deserializeStoredBudget(snapshot.current).budget
    : legacy === null ? emptyBudgetState : migrateLegacyBudget(legacy, emptyBudgetState, todayInBrussels());
  const contents = serializeBudget(budget);
  return { key, version: remote?.version ?? null, owner, snapshot, legacy, contents, empty: isPristineBudget(contents, legacy) };
}

function assertAssociation(choice: Association) {
  assertSession(choice.key.userId);
  const snapshot = readBudgetSnapshot(localStorage);
  if (!sameOwner(readBudgetOwner(localStorage), choice.owner)
    || snapshot.current !== choice.snapshot.current || snapshot.legacy !== choice.snapshot.legacy
    || localStorage.getItem(LEGACY_BUDGET_STORAGE_KEY) !== choice.legacy) throw new Error(changedBudget);
}

async function applyAssociation(choice: Association, action: AssociationAction, onLinked: (owner: BudgetOwner) => void) {
  const { userId } = choice.key;
  if ((action === 'restore') !== (choice.version !== null)) throw new Error(changedBudget);

  await withAccountTransition(async () => {
    assertAssociation(choice);
    discardStalePendingVault();
    if (readPendingVault(localStorage) !== null) throw new Error('Une création de coffre est déjà en attente.');
    const remote = await fetchVault(userId);
    if ((remote?.version ?? null) !== choice.version || (remote && !matchesVaultKey(choice.key, remote))) {
      throw new Error('La copie en ligne a changé. Relance le choix d’association.');
    }
    const contents = remote ? serializeBudget(deserializeStoredBudget(await decryptText(choice.key.key, remote)).budget) : null;
    const restoredHash = contents === null ? null : await fingerprint(contents);
    const initialHash = action === 'attach' && !choice.empty ? await fingerprint(choice.contents) : null;
    assertAssociation(choice);
    await saveStoredKey(choice.key);
    assertAssociation(choice);

    const owner = { type: 'account', userId } as const;
    if (!accountGuard({ owner, sessionUserId: readStoredSessionUserId(localStorage), keyUserId: choice.key.userId })) {
      throw new Error(changedAccount);
    }
    if (action !== 'attach') {
      localStorage.setItem(ACCOUNT_OWNER_KEY, JSON.stringify({ type: 'transition', userId }));
      writeBudgetSnapshot(localStorage, choice.snapshot, contents ?? serializeBudget(emptyBudgetState));
      localStorage.removeItem(LEGACY_BUDGET_STORAGE_KEY);
    }
    if (remote && restoredHash !== null) {
      writeSyncMemory(localStorage, { userId, version: remote.version, fingerprint: restoredHash });
    } else {
      clearSyncMemory(localStorage);
    }
    if (initialHash !== null) {
      localStorage.setItem(PENDING_VAULT_KEY, JSON.stringify({ userId, fingerprints: [initialHash] }));
    }
    localStorage.setItem(ACCOUNT_OWNER_KEY, JSON.stringify(owner));
    onLinked(owner);
  });
}

export function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const router = useRouter();
  const appRef = useRef(app);
  const keyRef = useRef<StoredKey | null>(null);
  const accountRef = useRef<Account | null | undefined>(undefined);
  const knownOwner = useRef<OwnerStatus | undefined>(undefined);
  const authBusy = useRef(false);
  const onlineAccount = useRef(false);
  const refreshAttempt = useRef(0);
  const signupIntent = useRef(false);
  const busy = useRef(false);
  const again = useRef(false);
  const retrySync = useRef<() => void>(() => {});
  const lastSeen = useRef<string | null>(null);
  const [phase, setPhase] = useState<SyncPhase>('loading');
  const [account, setAccount] = useState<Account | null>(null);
  const [association, setAssociation] = useState<Association>();
  const [remoteExists, setRemoteExists] = useState<boolean | null>(null);
  const [ownerInitialized, setOwnerInitialized] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [signingUp, setSigningUp] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [offerDeviceLock, setOfferDeviceLock] = useState(false);
  const dismissDeviceLockOffer = useCallback(() => setOfferDeviceLock(false), []);
  const [firstBudgetResult, setFirstBudgetResult] = useState(false);
  const [initialVaultConfirmed, setInitialVaultConfirmed] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [conflictRemoteDate, setConflictRemoteDate] = useState<string | null>(null);
  const conflictVersion = useRef<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { appRef.current = app; });

  const publishKey = useCallback((key: StoredKey) => {
    keyRef.current = key;
    publishBudgetAccess(key.userId, key.userId);
  }, []);

  const linkBudget = useCallback((choice: Association, action: AssociationAction) => applyAssociation(choice, action, (owner) => {
    if (!managedBackupsEnabled) {
      window.location.reload();
      return;
    }
    knownOwner.current = owner;
    appRef.current.reloadStoredBudget();
    setAssociation(undefined);
    publishKey(choice.key);
    setPhase(readPendingVault(localStorage) !== null ? 'vault-pending' : 'syncing');
  }), [publishKey]);

  const openAccountBudget = useCallback(async (owner: OwnerStatus, key: StoredKey, remote: RemoteVault | null, stillCurrent: () => boolean) => {
    const { userId } = key;
    const check = () => {
      if (!stillCurrent() || !sameOwner(readBudgetOwner(localStorage), owner)) throw new Error(changedAccount);
    };
    if (remote) await decryptText(key.key, remote);
    check();
    setRemoteExists(Boolean(remote));

    if (owner.type !== 'account') {
      const choice = prepareAssociation(key, remote);
      const fresh = choice.empty && choice.snapshot.current === null && choice.snapshot.legacy === null;
      if (!remote && fresh && (managedBackupsEnabled || accountSignupEnabled)) {
        setAssociation(choice);
        setPhase('first-budget');
        return;
      }
      if (choice.empty && choice.owner.type === 'guest') {
        await linkBudget(choice, remote ? 'restore' : 'attach');
        return;
      }
      setAssociation(choice);
      setPhase('awaiting-association');
      return;
    }

    await withAccountTransition(async () => {
      check();
      if (!accountGuard({ owner, sessionUserId: readStoredSessionUserId(localStorage), keyUserId: userId })) throw new Error(changedAccount);
      await saveStoredKey(key);
      check();
      publishKey(key);
      setPhase(readPendingVault(localStorage) !== null ? 'vault-pending' : 'syncing');
    });
  }, [linkBudget, publishKey]);

  const remoteAllowed = useCallback((key: StoredKey) =>
    keyRef.current === key && !authBusy.current && onlineAccount.current
      && canAccessBudget() && readExpiredSession(localStorage) === null, []);

  const syncAllowed = useCallback((key: StoredKey) =>
    remoteAllowed(key) && readPendingVault(localStorage) === null, [remoteAllowed]);

  const assertSync = useCallback((key: StoredKey) => {
    if (!syncAllowed(key)) throw new Error(changedAccount);
  }, [syncAllowed]);

  // À exécuter sous le verrou de transition quand un autre appareil a créé le coffre.
  const alignVaultKey = useCallback(async (key: StoredKey, remote: RemoteVault, check: () => void) => {
    if (remote.keyMode === 'legacy') throw new WrongPassphraseError();
    const next = await fetchManagedVaultKey(key.userId, remote);
    await decryptText(next.key, remote).catch(() => { throw new Error(unreadableVault); });
    check();
    await saveStoredKey(next);
    check();
    keyRef.current = next;
    return next;
  }, []);

  const pull = useCallback(async (key: StoredKey, remote: RemoteVault, expected: string, check = () => assertSync(key)) => {
    const { budget } = deserializeStoredBudget(await decryptText(key.key, remote));
    const restoredHash = await fingerprint(serializeBudget(budget));
    check();
    if (appRef.current.exportBudget() !== expected) throw new Error(changedBudget);
    appRef.current.restoreBudget(budget);
    check();
    writeSyncMemory(localStorage, { userId: key.userId, version: remote.version, fingerprint: restoredHash });
  }, [assertSync]);

  const runSync = useCallback(async () => {
    const initialKey = keyRef.current;
    if (!initialKey || !syncAllowed(initialKey)) return;
    let key = initialKey;
    const current = appRef.current;
    if (current.isBudgetLoading || current.storageBlocked || !current.canExportBudget || !current.isCurrentBudget()) return;
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    setPhase('syncing');
    setError('');
    const { userId } = key;
    let managedRemote = false;

    try {
      const local = current.exportBudget();
      const localIsEmpty = isPristineBudget(local, localStorage.getItem(LEGACY_BUDGET_STORAGE_KEY));
      const localFingerprint = await fingerprint(local);
      assertSync(key);
      const remote = await fetchVault(userId);
      assertSync(key);
      setRemoteExists(Boolean(remote));
      managedRemote = remote?.keyMode === 'managed_v1';
      if (remote && !matchesVaultKey(key, remote)) {
        key = await withAccountTransition(() => alignVaultKey(key, remote, () => assertSync(key)));
      }
      const memory = readSyncMemory(localStorage, userId);
      const decision = decideSync({ remoteVersion: remote?.version ?? null, memory, localFingerprint, localIsEmpty });

      switch (decision.action) {
        case 'idle':
          break;
        case 'create':
        case 'push': {
          const encrypted = await encryptText(key.key, local);
          assertSync(key);
          if (appRef.current.exportBudget() !== local) {
            again.current = true;
            break;
          }
          const version = decision.action === 'create'
            ? await createVault(userId, encrypted, key.salt, key.kdfIterations, key.keyMode)
            : await updateVault(userId, encrypted, decision.expectedVersion);
          assertSync(key);
          if (version === null) {
            again.current = true;
            break;
          }
          writeSyncMemory(localStorage, { userId, version, fingerprint: localFingerprint });
          setRemoteExists(true);
          break;
        }
        case 'pull':
          if (remote) await pull(key, remote, local);
          break;
        case 'conflict':
          conflictVersion.current = remote?.version ?? null;
          setConflictRemoteDate(remote?.updatedAt ?? null);
          setPhase('conflict');
          return;
      }
      assertSync(key);
      conflictVersion.current = null;
      setConflictRemoteDate(null);
      setLastSyncedAt(new Date());
      setPhase('synced');
    } catch (caught) {
      if (!syncAllowed(key)) return;
      if (caught instanceof WrongPassphraseError && !managedRemote) {
        keyRef.current = null;
        publishBudgetAccess(userId, null);
        setPhase('needs-passphrase');
        setError('La copie en ligne utilise une autre phrase secrète. Saisis-la pour continuer.');
      } else {
        setPhase('error');
        setError(caught instanceof WrongPassphraseError ? unreadableVault : message(caught, 'La synchronisation a échoué.'));
      }
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        window.setTimeout(() => retrySync.current(), 300);
      }
    }
  }, [alignVaultKey, assertSync, pull, syncAllowed]);

  const resumeVault = useCallback(async () => {
    const initialKey = keyRef.current;
    if (!initialKey || !remoteAllowed(initialKey) || busy.current || !appRef.current.canExportBudget
      || appRef.current.isBudgetLoading || !appRef.current.isCurrentBudget()) return;
    let key = initialKey;
    const initialMarker = localStorage.getItem(PENDING_VAULT_KEY);
    const pending = readPendingVault(localStorage);
    if (pending === null) return;
    if (pending !== 'unreadable' && pending.userId !== key.userId) {
      setError('La création du coffre est bloquée. Vérifie le compte de ce budget.');
      return;
    }
    busy.current = true;
    setPhase('vault-pending');
    setError('');
    let confirmed = false;
    try {
      await withAccountTransition(async () => {
        let expected = pending === 'unreadable' ? { userId: key.userId, fingerprints: [] } : pending;
        let expectedMarker = initialMarker;
        const checkPending = () => {
          if (!remoteAllowed(key) || expectedMarker === null || localStorage.getItem(PENDING_VAULT_KEY) !== expectedMarker) {
            throw new Error(changedAccount);
          }
        };
        const writePending = () => {
          expectedMarker = JSON.stringify(expected);
          localStorage.setItem(PENDING_VAULT_KEY, expectedMarker);
        };
        checkPending();
        if (pending === 'unreadable') writePending();
        let remote = await fetchVault(key.userId);
        checkPending();
        let version: number | null = null;
        let confirmedHash: string | undefined;
        if (!remote) {
          const local = appRef.current.exportBudget();
          const encrypted = await encryptText(key.key, local);
          confirmedHash = await fingerprint(local);
          checkPending();
          if (appRef.current.exportBudget() !== local) throw new Error(changedBudget);
          expected = rememberVaultFingerprint(expected, confirmedHash);
          writePending();
          version = await createVault(key.userId, encrypted, key.salt, key.kdfIterations, key.keyMode);
          checkPending();
          if (version === null) {
            remote = await fetchVault(key.userId);
            checkPending();
            if (!remote) throw new Error('Impossible de confirmer la création du coffre. Réessaie.');
          }
        }
        if (remote) {
          if (!matchesVaultKey(key, remote)) {
            if (remote.keyMode === 'legacy') {
              keyRef.current = null;
              publishBudgetAccess(key.userId, null);
              setRemoteExists(true);
              setError(vaultFromAnotherDevice);
              setPhase('needs-passphrase');
              return;
            }
            key = await alignVaultKey(key, remote, checkPending);
          }
          const { budget } = deserializeStoredBudget(await decryptText(key.key, remote));
          confirmedHash = await fingerprint(serializeBudget(budget));
          const localHash = await fingerprint(appRef.current.exportBudget());
          checkPending();
          if (!matchesInitialVault(confirmedHash, localHash, expected)) {
            conflictVersion.current = remote.version;
            setConflictRemoteDate(remote.updatedAt);
            setPhase('conflict');
            return;
          }
          version = remote.version;
        }
        if (version === null || confirmedHash === undefined) throw new Error('Impossible de confirmer la création du coffre. Réessaie.');
        checkPending();
        writeSyncMemory(localStorage, { userId: key.userId, version, fingerprint: confirmedHash });
        localStorage.removeItem(PENDING_VAULT_KEY);
        setRemoteExists(true);
        setInitialVaultConfirmed(true);
        confirmed = true;
      });
    } catch (caught) {
      if (remoteAllowed(key)) setError(caught instanceof WrongPassphraseError && key.keyMode === 'managed_v1'
        ? unreadableVault : message(caught, 'Le coffre est encore en attente.'));
    } finally {
      busy.current = false;
    }
    if (confirmed) await runSync();
  }, [alignVaultKey, remoteAllowed, runSync]);

  useEffect(() => { retrySync.current = () => void runSync(); }, [runSync]);

  const adopt = useCallback(async (next: Account | null, force = false, verified = true) => {
    const userId = next?.userId ?? null;
    const previous = accountRef.current === undefined ? undefined : accountRef.current?.userId ?? null;
    if (authBusy.current || readStoredSessionUserId(localStorage) !== userId
      || (!force && previous === userId && onlineAccount.current === verified)) return;
    const resumedOnline = verified && previous === userId && !onlineAccount.current;
    accountRef.current = next;
    onlineAccount.current = verified;
    keyRef.current = null;
    lastSeen.current = null;
    conflictVersion.current = null;
    publishBudgetAccess(undefined, null);
    setAccount(next);
    setAssociation(undefined);
    setRemoteExists(null);
    setLastSyncedAt(null);
    setFirstBudgetResult(false);
    setInitialVaultConfirmed(false);
    setConflictRemoteDate(null);
    setError('');
    setPhase('loading');
    const stillCurrent = () => accountRef.current === next && readStoredSessionUserId(localStorage) === userId && !authBusy.current;

    try {
      const owner = readBudgetOwner(localStorage);
      if (!stillCurrent()) return;
      knownOwner.current = owner;
      if (owner.type === 'unreadable') throw new Error('Le rattachement du budget est illisible. Les données restent sur cet appareil.');
      if (owner.type !== 'guest' && owner.userId !== userId) {
        setPhase(cloudConfigured ? (userId === null ? 'signed-out' : 'account-mismatch') : 'account-error');
        if (!cloudConfigured) setError('La connexion au compte de ce budget est indisponible sur cette version.');
        return;
      }
      if (userId === null) {
        publishBudgetAccess(null, null);
        setPhase(cloudConfigured ? 'signed-out' : 'off');
        return;
      }
      if (!sameOwner(readBudgetOwner(localStorage), owner)) return;
      const stored = await loadStoredKey(userId);
      if (!stillCurrent() || !sameOwner(readBudgetOwner(localStorage), owner)) return;
      if (owner.type === 'transition' && verified && stored) {
        const marker = localStorage.getItem(PENDING_VAULT_KEY);
        const pending = readPendingVault(localStorage);
        if (pending && pending !== 'unreadable' && pending.userId === userId) {
          const recovered = await withAccountTransition(async () => {
            const snapshot = readBudgetSnapshot(localStorage);
            if (snapshot.current === null || !pending.fingerprints.includes(await fingerprint(snapshot.current))) return false;
            if (!stillCurrent() || !sameOwner(readBudgetOwner(localStorage), owner)
              || readBudgetSnapshot(localStorage).current !== snapshot.current
              || marker === null || localStorage.getItem(PENDING_VAULT_KEY) !== marker) return false;
            localStorage.setItem(ACCOUNT_OWNER_KEY, JSON.stringify({ type: 'account', userId }));
            return true;
          });
          if (recovered) { window.location.reload(); return; }
          if (!stillCurrent()) return;
        }
      }
      if (owner.type === 'account' && stored && accountGuard({ owner, sessionUserId: userId, keyUserId: stored.userId })) {
        keyRef.current = stored;
        publishBudgetAccess(userId, stored.userId);
        const pending = readPendingVault(localStorage) !== null;
        setPhase(!verified ? 'local-only' : pending ? 'vault-pending' : 'syncing');
        // L’accès local peut rester vrai avant et après le renouvellement dans le même rendu.
        if (resumedOnline && !pending) window.setTimeout(() => retrySync.current(), 0);
        return;
      }
      if (!verified) {
        setPhase('account-error');
        return;
      }
      if (!managedBackupsEnabled) setPhase('needs-passphrase');
      const remote = await fetchVault(userId);
      if (!stillCurrent()) return;
      setRemoteExists(Boolean(remote));
      if (managedBackupsEnabled && (!remote || remote.keyMode === 'managed_v1')) {
        const key = await fetchManagedVaultKey(userId, remote);
        await openAccountBudget(owner, key, remote, stillCurrent);
      } else {
        setPhase('needs-passphrase');
      }
    } catch (caught) {
      if (!stillCurrent()) return;
      setError(caught instanceof WrongPassphraseError ? unreadableVault : message(caught, 'Impossible de vérifier le compte.'));
      setPhase((current) => current === 'needs-passphrase' ? current : 'account-error');
    }
  }, [openAccountBudget]);

  const refreshAccount = useCallback(async (force = true) => {
    if (authBusy.current) return;
    const attempt = ++refreshAttempt.current;
    let expired: Account | null = null;
    try {
      await initializeOwner();
      if (authBusy.current || attempt !== refreshAttempt.current) return;
      const storedUser = readStoredSessionUserId(localStorage);
      if (storedUser === undefined) throw new Error('La session enregistrée est illisible. Le budget reste protégé.');
      if (storedUser === null && readBudgetOwner(localStorage).type === 'unreadable' && navigator.locks) {
        const repaired = await withAccountTransition(() => {
          if (authBusy.current || attempt !== refreshAttempt.current || readStoredSessionUserId(localStorage) !== null
            || localStorage.getItem(ACCOUNT_OWNER_KEY) === null || readBudgetOwner(localStorage).type !== 'unreadable') return false;
          clearSyncMemory(localStorage);
          localStorage.setItem(ACCOUNT_OWNER_KEY, JSON.stringify({ type: 'guest' }));
          return true;
        });
        if (repaired) { window.location.reload(); return; }
        if (authBusy.current || attempt !== refreshAttempt.current) return;
      }
      if (!cloudConfigured) {
        if (readStoredSessionUserId(localStorage) !== null) throw new Error('La connexion au compte de ce budget est indisponible.');
        await adopt(null, force);
        return;
      }
      expired = readExpiredSession(localStorage);
      if (expired) {
        await adopt(expired, false, false);
        if (authBusy.current || attempt !== refreshAttempt.current) return;
      }
      setOwnerInitialized(true);
      const { data, error: sessionError } = await cloudClient().auth.getSession();
      if (authBusy.current || attempt !== refreshAttempt.current) return;
      if (sessionError) throw sessionError;
      const user = data.session?.user;
      await adopt(user ? { userId: user.id, email: user.email ?? '' } : null, force);
    } catch (caught) {
      if (authBusy.current || attempt !== refreshAttempt.current) return;
      if (expired && readStoredSessionUserId(localStorage) !== null && readStoredSessionUserId(localStorage) !== expired.userId) return;
      if (expired && isAuthRetryableFetchError(caught) && canAccessBudget()) return;
      onlineAccount.current = false;
      publishBudgetAccess(undefined, null);
      setError(message(caught, 'Impossible de vérifier la session.'));
      setPhase('account-error');
    }
  }, [adopt]);

  useEffect(() => {
    let disposed = false;
    void Promise.resolve().then(() => { if (!disposed) void refreshAccount(false); });
    return () => { disposed = true; };
  }, [refreshAccount]);

  useEffect(() => {
    if (!ownerInitialized || !cloudConfigured) return;
    let disposed = false;
    const { data } = cloudClient().auth.onAuthStateChange((_event, session) => {
      if (authBusy.current) return;
      const current = accountRef.current === undefined ? undefined : accountRef.current?.userId ?? null;
      const user = session?.user;
      if (current !== (user?.id ?? null) && readStoredSessionUserId(localStorage) !== current) {
        publishBudgetAccess(undefined, null);
      }
      // Sortir du callback Supabase avant toute requête au coffre.
      window.setTimeout(() => {
        if (!disposed) void adopt(user ? { userId: user.id, email: user.email ?? '' } : null);
      }, 0);
    });
    return () => { disposed = true; data.subscription.unsubscribe(); };
  }, [adopt, ownerInitialized]);

  useEffect(() => {
    if (app.canExportBudget && !app.isBudgetLoading) void Promise.resolve().then(runSync);
  }, [app.canExportBudget, app.isBudgetLoading, runSync]);

  useEffect(() => {
    if (phase === 'vault-pending' && app.canExportBudget && !app.isBudgetLoading) {
      void Promise.resolve().then(resumeVault);
    }
  }, [phase, app.canExportBudget, app.isBudgetLoading, resumeVault]);

  useEffect(() => {
    if (!keyRef.current || !app.canExportBudget || app.isBudgetLoading) return;
    let snapshot: string;
    try { snapshot = app.exportBudget(); } catch { return; }
    if (snapshot === lastSeen.current) return;
    const first = lastSeen.current === null;
    lastSeen.current = snapshot;
    if (first) return;
    const timer = window.setTimeout(() => void runSync(), PUSH_DELAY_MS);
    return () => window.clearTimeout(timer);
  });

  useEffect(() => {
    const check = () => {
      const userId = accountRef.current === undefined ? undefined : accountRef.current?.userId ?? null;
      const ownerChanged = !knownOwner.current || !sameOwner(knownOwner.current, readBudgetOwner(localStorage));
      if (userId !== readStoredSessionUserId(localStorage) || ownerChanged || !onlineAccount.current
        || readExpiredSession(localStorage) !== null) void refreshAccount(true);
      else void runSync();
    };
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    const stored = (event: StorageEvent) => {
      if (event.key === PENDING_VAULT_KEY && event.newValue === null) void refreshAccount(true);
      else if (event.key === AUTH_STORAGE_KEY || event.key === ACCOUNT_OWNER_KEY || event.key === null) check();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', visible);
    window.addEventListener('online', check);
    window.addEventListener('storage', stored);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', visible);
      window.removeEventListener('online', check);
      window.removeEventListener('storage', stored);
    };
  }, [refreshAccount, runSync]);

  function beginSignIn(createAccount: boolean) {
    signupIntent.current = Boolean(createAccount && accountSignupEnabled && canAccessBudget()
      && readBudgetOwner(localStorage).type === 'guest' && readStoredSessionUserId(localStorage) === null);
    setSigningUp(signupIntent.current);
    setPasswordRequired(false);
    setOfferDeviceLock(false);
    setOtpEmail('');
    setError('');
  }

  async function sendCode(email: string) {
    setError('');
    const normalized = email.trim();
    const { error: authError } = await cloudClient().auth.signInWithOtp({
      email: normalized, options: { shouldCreateUser: accountSignupEnabled && signupIntent.current },
    });
    if (authError) throw new Error(authError.status === 429
      ? 'Trop de demandes de code. Patiente quelques minutes avant de réessayer.'
      : 'Le code n’a pas pu être envoyé. Vérifie l’adresse e-mail de ton compte.');
    setOtpEmail(normalized);
  }

  async function verifyCode(email: string, code: string) {
    if (authBusy.current) return;
    refreshAttempt.current++;
    authBusy.current = true;
    publishBudgetAccess(undefined, null);
    setPhase('loading');
    setError('');
    let verificationError = '';
    try {
      await withAccountTransition(async () => {
        assertSession(null);
        const { error: authError } = await cloudClient().auth.verifyOtp({
          email: email.trim(), token: code.trim(), type: 'email',
        });
        if (authError) throw new Error('Code incorrect ou expiré. Demande un nouveau code.');
      });
      setOtpEmail('');
      // Le code e-mail sert à l’inscription et à la récupération : le mot de passe est choisi juste après.
      setPasswordRequired(true);
      setOfferDeviceLock(true);
    } catch (caught) {
      verificationError = message(caught, 'Impossible de vérifier le code.');
    } finally {
      authBusy.current = false;
    }
    await refreshAccount(true);
    if (verificationError) setError(verificationError);
  }

  async function signInWithPassword(email: string, password: string) {
    if (authBusy.current) return;
    refreshAttempt.current++;
    authBusy.current = true;
    publishBudgetAccess(undefined, null);
    setPhase('loading');
    setError('');
    let failure = '';
    try {
      await withAccountTransition(async () => {
        assertSession(null);
        const { error: authError } = await cloudClient().auth.signInWithPassword({ email: email.trim(), password });
        if (!authError) return;
        if (authError.status === 429) throw new Error('Trop d’essais. Patiente quelques minutes avant de réessayer.');
        if (isAuthRetryableFetchError(authError)) throw new Error('Connexion impossible. Vérifie ta connexion internet.');
        throw new Error('E-mail ou mot de passe incorrect.');
      });
      setOfferDeviceLock(true);
    } catch (caught) {
      failure = message(caught, 'Connexion impossible.');
    } finally {
      authBusy.current = false;
    }
    await refreshAccount(true);
    if (failure) setError(failure);
  }

  async function setPassword(password: string) {
    const problem = passwordProblem(password);
    if (problem) throw new Error(problem);
    const userId = accountRef.current?.userId;
    if (!userId) throw new Error('Connecte-toi d’abord.');
    assertSession(userId);
    const { error: authError } = await cloudClient().auth.updateUser({ password });
    if (authError) {
      throw new Error(authError.code === 'same_password' ? 'Choisis un mot de passe différent de l’ancien.'
        : authError.code === 'weak_password' ? 'Ce mot de passe est trop facile à deviner. Choisis-en un autre.'
          : isAuthRetryableFetchError(authError) ? 'Enregistrement impossible. Vérifie ta connexion internet.'
            : 'Le mot de passe n’a pas pu être enregistré. Réessaie.');
    }
    setPasswordRequired(false);
  }

  async function unlock(passphrase: string, savedPassphrase = false) {
    const active = accountRef.current;
    if (!active || authBusy.current) throw new Error('Connecte-toi d’abord.');
    const { userId } = active;
    assertSession(userId);
    const owner = readBudgetOwner(localStorage);
    if (!canAssociate(owner, userId) && !(owner.type === 'account' && owner.userId === userId)) throw new Error(changedAccount);
    setError('');
    const remote = await fetchVault(userId);
    assertSession(userId);
    if (managedBackupsEnabled && (!remote || remote.keyMode === 'managed_v1')) {
      await refreshAccount(true);
      return;
    }
    if (!remote) {
      const problem = passphraseProblem(passphrase);
      if (problem) throw new Error(problem);
      if (signingUp && !savedPassphrase) throw new Error('Confirme que tu as enregistré ta phrase secrète.');
    }
    const salt = remote?.salt ?? newSalt();
    const kdfIterations = remote?.kdfIterations ?? KDF_ITERATIONS;
    const key = await deriveKey(passphrase, salt, kdfIterations);
    const stored: StoredKey = { userId, key, salt, kdfIterations };
    await openAccountBudget(owner, stored, remote, () => accountRef.current === active
      && readStoredSessionUserId(localStorage) === userId && !authBusy.current);
  }

  async function associate(action: AssociationAction) {
    if (!association || authBusy.current) throw new Error('Relance le choix d’association.');
    setError('');
    await linkBudget(association, action);
  }

  async function finishAccountBudget(input: FirstBudgetInput) {
    const choice = association;
    if (phase !== 'first-budget' || !choice || !choice.empty || authBusy.current || !onlineAccount.current
      || choice.snapshot.current !== null || choice.snapshot.legacy !== null) throw new Error(changedBudget);
    const { key } = choice;
    await withAccountTransition(async () => {
      assertAssociation(choice);
      if (readPendingVault(localStorage) !== null || await fetchVault(key.userId)) {
        throw new Error('La copie en ligne a changé. Retourne à ton compte avant de continuer.');
      }
      assertAssociation(choice);
      await saveStoredKey(key);
      assertAssociation(choice);
      const transition = { type: 'transition', userId: key.userId } as const;
      localStorage.setItem(ACCOUNT_OWNER_KEY, JSON.stringify(transition));
      const saved = serializeBudget(appRef.current.finishOnboarding(input, key.userId));
      const hash = await fingerprint(saved);
      assertSession(key.userId);
      if (!sameOwner(readBudgetOwner(localStorage), transition) || readBudgetSnapshot(localStorage).current !== saved) {
        throw new Error(changedBudget);
      }
      localStorage.setItem(PENDING_VAULT_KEY, JSON.stringify({ userId: key.userId, fingerprints: [hash] }));
      clearSyncMemory(localStorage);
      const linked = { type: 'account', userId: key.userId } as const;
      localStorage.setItem(ACCOUNT_OWNER_KEY, JSON.stringify(linked));
      knownOwner.current = linked;
      publishKey(key);
      setAssociation(undefined);
      setFirstBudgetResult(true);
      setPhase('vault-pending');
      router.replace('/dashboard');
    });
  }

  async function resolveConflict(keep: 'device' | 'cloud') {
    const key = keyRef.current;
    if (!key || !remoteAllowed(key) || busy.current || phase !== 'conflict') return;
    const marker = localStorage.getItem(PENDING_VAULT_KEY);
    const pending = readPendingVault(localStorage);
    if (pending === 'unreadable' || (pending && pending.userId !== key.userId)) return;
    const check = () => {
      if (!pending) { assertSync(key); return; }
      if (!remoteAllowed(key) || marker === null || localStorage.getItem(PENDING_VAULT_KEY) !== marker) throw new Error(changedAccount);
    };
    busy.current = true;
    setPhase('syncing');
    try {
      const resolve = async () => {
        check();
        const local = appRef.current.exportBudget();
        const remote = await fetchVault(key.userId);
        check();
        if (!remote || remote.version !== conflictVersion.current || !matchesVaultKey(key, remote)) {
          throw new Error('La copie en ligne a changé. Synchronise de nouveau avant de choisir.');
        }
        if (keep === 'cloud') {
          await pull(key, remote, local, check);
        } else {
          const encrypted = await encryptText(key.key, local);
          const hash = await fingerprint(local);
          check();
          if (appRef.current.exportBudget() !== local) throw new Error(changedBudget);
          const version = await updateVault(key.userId, encrypted, remote.version);
          check();
          if (version === null) throw new Error('La copie en ligne vient encore de changer. Réessaie.');
          writeSyncMemory(localStorage, { userId: key.userId, version, fingerprint: hash });
        }
        check();
        if (pending) {
          localStorage.removeItem(PENDING_VAULT_KEY);
          setInitialVaultConfirmed(true);
        }
      };
      if (pending) await withAccountTransition(resolve);
      else await resolve();
      conflictVersion.current = null;
      setConflictRemoteDate(null);
      setLastSyncedAt(new Date());
      setPhase('synced');
    } catch (caught) {
      if (remoteAllowed(key)) {
        setPhase('conflict');
        setError(message(caught, 'Le choix n’a pas pu être appliqué.'));
      }
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        window.setTimeout(() => void runSync(), 300);
      }
    }
  }

  async function signOut(deleteOnline = false) {
    const userId = accountRef.current?.userId;
    if (!userId || authBusy.current) return;
    if (deleteOnline) {
      const key = keyRef.current;
      if (!key) return;
      assertSync(key);
    }
    refreshAttempt.current++;
    authBusy.current = true;
    publishBudgetAccess(undefined, null);
    setPhase('loading');
    let signOutError = '';
    try {
      await withAccountTransition(async () => {
        assertSession(userId);
        if (deleteOnline) {
          const owner = readBudgetOwner(localStorage);
          if (owner.type !== 'account' || owner.userId !== userId) throw new Error(changedAccount);
          await deleteCloudAccount();
          const remaining = readStoredSessionUserId(localStorage);
          if (remaining !== null && remaining !== userId) throw new Error(changedAccount);
        }
        if (readStoredSessionUserId(localStorage) === userId) {
          const { error: failure } = await cloudClient().auth.signOut({ scope: 'local' });
          if (failure) throw failure;
        }
        assertSession(null);
        await clearStoredKey();
        assertSession(null);
        // Le parcours existant de suppression explicite conserve le budget local en mode invité.
        if (deleteOnline) {
          const owner = readBudgetOwner(localStorage);
          if (owner.type !== 'account' || owner.userId !== userId) throw new Error(changedAccount);
          clearSyncMemory(localStorage);
          localStorage.setItem(ACCOUNT_OWNER_KEY, JSON.stringify({ type: 'guest' }));
        }
      });
    } catch (caught) {
      signOutError = message(caught, deleteOnline ? 'La suppression du compte a échoué.' : 'La déconnexion a échoué.');
    } finally {
      authBusy.current = false;
    }
    if (deleteOnline && !signOutError) {
      window.location.reload();
      return;
    }
    if (!signOutError) beginSignIn(false);
    await refreshAccount(true);
    if (signOutError) setError(signOutError);
  }

  const value: CloudSyncContext = {
    phase, account, remoteExists, associationEmpty: association?.empty ?? false, lastSyncedAt, conflictRemoteDate, error,
    otpEmail, resetCode: () => { setOtpEmail(''); setError(''); },
    sendCode, verifyCode, refreshAccount, unlock, associate, syncNow: runSync, resolveConflict,
    signingUp, firstBudgetResult, initialVaultConfirmed, beginSignIn, finishAccountBudget, resumeVault,
    passwordRequired: passwordRequired && account !== null, offerDeviceLock: offerDeviceLock && account !== null,
    dismissDeviceLockOffer, signInWithPassword, setPassword,
    dismissFirstBudgetResult: () => setFirstBudgetResult(false),
    signOut, deleteAccount: () => signOut(true),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCloudSync(): CloudSyncContext {
  const context = useContext(Context);
  if (!context) throw new Error('useCloudSync doit être utilisé dans CloudSyncProvider');
  return context;
}
