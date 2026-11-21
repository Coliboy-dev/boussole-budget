'use client';

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import {
  LOCK_EPOCH_KEY, LOCK_STORAGE_KEY, VEIL_CLASS, createLockConfig, pinMatches, readLockState, registerFailure,
  keepVeil, registerSuccess, returnDecision, writeLockConfig, type LockConfig, type LockDelay, type LockState,
} from '@/lib/app-lock';
import { eraseLocalData, type EraseResult } from '@/lib/account-lifecycle';
import { deleteKeyStore } from '@/lib/cloud-remote';
import { SECURITY_EVENT_KEY, postSecurityEvent, subscribeSecurityEvents } from '@/lib/security-channel';
import LockScreen from './LockScreen';

type Phase = 'unknown' | 'unlocked' | 'locked';

interface LockSnapshot {
  phase: Phase;
  config: LockConfig | null;
  /** Réglage présent mais illisible : verrouillé, sans possibilité de vérifier un code. */
  unreadable: boolean;
}

// État du verrou de cet onglet, hors de React : lu sans effet ni second rendu.
const SERVER_SNAPSHOT: LockSnapshot = { phase: 'unknown', config: null, unreadable: false };
let snapshot: LockSnapshot | null = null;
let hiddenAt: number | null = null;
let unlockedAt = 0;
const listeners = new Set<() => void>();

function readState(): LockState {
  try {
    return readLockState(localStorage);
  } catch {
    return { status: 'unreadable' };
  }
}

/** Champs du snapshot qui décrivent le réglage lu dans le stockage. */
function settingsFrom(state: LockState): Pick<LockSnapshot, 'config' | 'unreadable'> {
  return { config: state.status === 'valid' ? state.config : null, unreadable: state.status === 'unreadable' };
}

function getSnapshot(): LockSnapshot {
  if (!snapshot) {
    const state = readState();
    // Au lancement, un verrou existant (valide ou illisible) verrouille toujours, quel que soit le délai.
    snapshot = { phase: state.status === 'absent' ? 'unlocked' : 'locked', ...settingsFrom(state) };
  }
  return snapshot;
}

function update(patch: Partial<LockSnapshot>) {
  snapshot = { ...getSnapshot(), ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setVeil(on: boolean) {
  document.documentElement.classList.toggle(VEIL_CLASS, on);
}

function readEpoch(): number {
  try {
    return Number(localStorage.getItem(LOCK_EPOCH_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function hasLock(current: LockSnapshot): boolean {
  return Boolean(current.config) || current.unreadable;
}

/**
 * Passe à l’écran de verrouillage sans jamais dévoiler le budget.
 * Si l’écran de verrouillage est déjà affiché, il ne contient aucun montant : le voile est retiré tout de suite.
 * Sinon le voile reste, et c’est l’écran de verrouillage qui le retire après son rendu.
 */
function showLockScreen() {
  const phaseBefore = getSnapshot().phase === 'locked' ? 'locked' : 'unlocked';
  setVeil(keepVeil('show-lock', phaseBefore));
  if (phaseBefore === 'unlocked') update({ phase: 'locked' });
}

function storeConfig(next: LockConfig | null) {
  try {
    if (next) writeLockConfig(localStorage, next);
    else localStorage.removeItem(LOCK_STORAGE_KEY);
  } catch {
    // Stockage indisponible : le réglage vaut pour cette session.
  }
  update({ config: next, unreadable: false });
}

function lockEverywhere() {
  if (!hasLock(getSnapshot())) return;
  try {
    localStorage.setItem(LOCK_EPOCH_KEY, String(Date.now()));
  } catch {
    // Stockage indisponible.
  }
  postSecurityEvent('locked');
  showLockScreen();
}

async function checkPin(pin: string): Promise<boolean> {
  const current = getSnapshot().config;
  if (!current || current.retryAt > Date.now()) return false;
  if (await pinMatches(current, pin)) {
    storeConfig(registerSuccess(current));
    return true;
  }
  storeConfig(registerFailure(current, Date.now()));
  return false;
}

/** Retour au premier plan, ou message d’un autre onglet : relit le réglage et applique la règle. */
function onReturn() {
  const state = readState();
  const current = getSnapshot();
  update(settingsFrom(state));

  const decision = returnDecision({
    phase: current.phase === 'locked' ? 'locked' : 'unlocked',
    state, hiddenAt, now: Date.now(), lockEpoch: readEpoch(), unlockedAt,
  });
  hiddenAt = null;
  if (decision === 'show-lock') {
    showLockScreen();
    return;
  }
  // Verrou absent (désactivé ailleurs) ou délai non écoulé : budget affiché, sans voile.
  setVeil(false);
  if (decision === 'unlock') update({ phase: 'unlocked' });
}

interface LockContextValue {
  enabled: boolean;
  /** Réglage du verrou illisible : seul l’effacement est possible. */
  unreadable: boolean;
  delay: LockDelay;
  /** Heure jusqu’à laquelle les essais sont refusés (0 si aucune attente). */
  retryAt: number;
  enable: (pin: string, delay: LockDelay) => Promise<void>;
  changePin: (current: string, next: string) => Promise<boolean>;
  disable: (current: string) => Promise<boolean>;
  setDelay: (delay: LockDelay) => void;
  lockNow: () => void;
  unlock: (pin: string) => Promise<boolean>;
  eraseEverything: () => Promise<EraseResult>;
}

const actions: Omit<LockContextValue, 'enabled' | 'unreadable' | 'delay' | 'retryAt'> = {
  enable: async (pin, delay) => {
    storeConfig(await createLockConfig(pin, delay));
    unlockedAt = Date.now();
    // Les autres onglets déjà ouverts se verrouillent : le verrou vient d’être activé.
    postSecurityEvent('lock-enabled');
  },
  changePin: async (current, next) => {
    if (!(await checkPin(current))) return false;
    storeConfig(await createLockConfig(next, getSnapshot().config?.delay ?? 0));
    postSecurityEvent('lock-settings-changed');
    return true;
  },
  disable: async (current) => {
    if (!(await checkPin(current))) return false;
    storeConfig(null);
    postSecurityEvent('lock-settings-changed');
    return true;
  },
  setDelay: (delay) => {
    const current = getSnapshot().config;
    if (!current) return;
    storeConfig({ ...current, delay });
    postSecurityEvent('lock-settings-changed');
  },
  lockNow: lockEverywhere,
  unlock: async (pin) => {
    if (!(await checkPin(pin))) return false;
    unlockedAt = Date.now();
    update({ phase: 'unlocked' });
    return true;
  },
  eraseEverything: async () => {
    const result = await eraseLocalData({ storage: localStorage, deleteKeyStore });
    if (result.ok) {
      postSecurityEvent('local-erased');
      // Le message posté a recréé sa clé de repli : elle est retirée aussi.
      try {
        localStorage.removeItem(SECURITY_EVENT_KEY);
      } catch {
        // Stockage indisponible.
      }
    }
    return result;
  },
};

const LockContext = createContext<LockContextValue | null>(null);

export function LockProvider({ children }: { children: ReactNode }) {
  const { phase, config, unreadable } = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);

  useEffect(() => {
    // Départ de l’app : plusieurs signaux, car iOS n’en garantit aucun en particulier.
    const onLeave = () => {
      if (!hasLock(getSnapshot())) return;
      hiddenAt ??= Date.now();
      setVeil(true);
    };
    // Perte du focus (sélecteur d’apps, centre de notifications…) : voile seul, sans compter une absence.
    const onBlur = () => {
      if (hasLock(getSnapshot())) setVeil(true);
    };
    // Retour : n’importe lequel de ces signaux suffit. Si le voile est posé ou une absence en cours,
    // `onReturn` décide du verrouillage avant de retirer le voile.
    const onShown = () => {
      if (document.visibilityState !== 'visible') return;
      if (hiddenAt === null && !document.documentElement.classList.contains(VEIL_CLASS)) return;
      onReturn();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onLeave();
      else onShown();
    };
    const unsubscribe = subscribeSecurityEvents((type) => {
      if (type === 'local-erased') {
        window.location.replace('/');
        return;
      }
      if (type === 'locked' || type === 'lock-enabled') {
        update(settingsFrom(readState()));
        if (hasLock(getSnapshot())) showLockScreen();
        return;
      }
      onReturn();
    });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pageshow', onShown);
    window.addEventListener('focus', onShown);
    // Filet de sécurité : un toucher sur un écran resté voilé le rétablit toujours.
    document.addEventListener('pointerdown', onShown, true);
    document.addEventListener('touchstart', onShown, true);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pageshow', onShown);
      window.removeEventListener('focus', onShown);
      document.removeEventListener('pointerdown', onShown, true);
      document.removeEventListener('touchstart', onShown, true);
      unsubscribe();
    };
  }, []);

  // Déverrouillé ou sans verrou : aucun voile ne doit rester.
  useEffect(() => {
    if (phase === 'unlocked') setVeil(false);
  }, [phase]);

  const value: LockContextValue = {
    ...actions,
    enabled: Boolean(config) || unreadable,
    unreadable,
    delay: config?.delay ?? 0,
    retryAt: config?.retryAt ?? 0,
  };

  return (
    <LockContext.Provider value={value}>
      {phase === 'unknown' && <NeutralScreen />}
      {phase === 'locked' && <LockScreen />}
      {phase === 'unlocked' && children}
    </LockContext.Provider>
  );
}

function NeutralScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status">
      <span className="sr-only">Chargement de Boussole</span>
    </div>
  );
}

export function useLock(): LockContextValue {
  const context = useContext(LockContext);
  if (!context) throw new Error('useLock doit être utilisé dans LockProvider');
  return context;
}
