'use client';

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import {
  LOCK_EPOCH_KEY, LOCK_STORAGE_KEY, VEIL_CLASS, createLockConfig, pinMatches, readLockConfig, registerFailure,
  registerSuccess, shouldLock, writeLockConfig, type LockConfig, type LockDelay,
} from '@/lib/app-lock';
import { eraseLocalData, type EraseResult } from '@/lib/account-lifecycle';
import { deleteKeyStore } from '@/lib/cloud-remote';
import { SECURITY_EVENT_KEY, postSecurityEvent, subscribeSecurityEvents } from '@/lib/security-channel';
import LockScreen from './LockScreen';

type Phase = 'unknown' | 'unlocked' | 'locked';

interface LockSnapshot {
  phase: Phase;
  config: LockConfig | null;
}

// État du verrou de cet onglet, hors de React : lu sans effet ni second rendu.
const SERVER_SNAPSHOT: LockSnapshot = { phase: 'unknown', config: null };
let snapshot: LockSnapshot | null = null;
let hiddenAt: number | null = null;
let unlockedAt = 0;
const listeners = new Set<() => void>();

function readConfig(): LockConfig | null {
  try {
    return readLockConfig(localStorage);
  } catch {
    return null;
  }
}

function getSnapshot(): LockSnapshot {
  if (!snapshot) {
    const config = readConfig();
    // Au lancement, un code existant verrouille toujours, quel que soit le délai.
    snapshot = { phase: config ? 'locked' : 'unlocked', config };
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

function storeConfig(next: LockConfig | null) {
  try {
    if (next) writeLockConfig(localStorage, next);
    else localStorage.removeItem(LOCK_STORAGE_KEY);
  } catch {
    // Stockage indisponible : le réglage vaut pour cette session.
  }
  update({ config: next });
}

function engage(broadcast: boolean) {
  if (!getSnapshot().config) return;
  if (broadcast) {
    try {
      localStorage.setItem(LOCK_EPOCH_KEY, String(Date.now()));
    } catch {
      // Stockage indisponible.
    }
    postSecurityEvent('locked');
  }
  update({ phase: 'locked' });
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

interface LockContextValue {
  enabled: boolean;
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

const actions: Omit<LockContextValue, 'enabled' | 'delay' | 'retryAt'> = {
  enable: async (pin, delay) => {
    storeConfig(await createLockConfig(pin, delay));
    unlockedAt = Date.now();
    postSecurityEvent('lock-settings-changed');
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
  lockNow: () => engage(true),
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
  const { phase, config } = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (!getSnapshot().config) return;
        hiddenAt = Date.now();
        setVeil(true);
        return;
      }
      // Un autre onglet a pu activer, modifier ou désactiver le verrou.
      const latest = readConfig();
      update({ config: latest });
      if (!latest) {
        setVeil(false);
        return;
      }
      const lockNeeded = shouldLock({ hiddenAt, now: Date.now(), delay: latest.delay }) || readEpoch() > unlockedAt;
      hiddenAt = null;
      // Si le verrou s’engage, le voile reste : l’écran de verrouillage le retire après son rendu.
      if (lockNeeded) engage(false);
      else setVeil(false);
    };
    const unsubscribe = subscribeSecurityEvents((type) => {
      if (type === 'local-erased') {
        window.location.replace('/');
        return;
      }
      const latest = readConfig();
      update({ config: latest });
      if (type === 'locked' && latest) {
        setVeil(true);
        update({ phase: 'locked' });
      }
    });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
    };
  }, []);

  // Déverrouillé ou sans verrou : aucun voile ne doit rester.
  useEffect(() => {
    if (phase === 'unlocked') setVeil(false);
  }, [phase]);

  const value: LockContextValue = {
    ...actions,
    enabled: Boolean(config),
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
