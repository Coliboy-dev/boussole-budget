'use client';

import { useSyncExternalStore } from 'react';

const storageKey = 'boussole-payment-reminders';

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(storageKey, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(storageKey, listener);
  };
}

function getSnapshot() {
  try {
    return window.localStorage.getItem(storageKey) !== 'off';
  } catch {
    return true;
  }
}

export function usePaymentReminders() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

export function setPaymentRemindersEnabled(enabled: boolean) {
  window.localStorage.setItem(storageKey, enabled ? 'on' : 'off');
  window.dispatchEvent(new Event(storageKey));
}
