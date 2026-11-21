'use client';

import { useSyncExternalStore } from 'react';
import {
  ACCOUNT_OWNER_KEY, AUTH_STORAGE_KEY, accountGuard, readBudgetOwner, readStoredSessionUserId, type SessionUserId,
} from './account-guard';

let sessionUserId: SessionUserId;
let keyUserId: string | null = null;
const listeners = new Set<() => void>();

export function publishBudgetAccess(session: SessionUserId, key: string | null) {
  sessionUserId = session;
  keyUserId = key;
  for (const listener of listeners) listener();
}

export function canAccessBudget(): boolean {
  if (typeof window === 'undefined' || sessionUserId === undefined) return false;
  try {
    return readStoredSessionUserId(localStorage) === sessionUserId
      && accountGuard({ sessionUserId, keyUserId, owner: readBudgetOwner(localStorage) });
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === AUTH_STORAGE_KEY || event.key === ACCOUNT_OWNER_KEY) listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', listener);
  window.addEventListener('pageshow', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', listener);
    window.removeEventListener('pageshow', listener);
  };
}

export function useBudgetAccess(): boolean {
  return useSyncExternalStore(subscribe, canAccessBudget, () => false);
}
