'use client';

import { useEffect, useSyncExternalStore } from 'react';

export function RegisterOfflineSupport() {
  useEffect(() => {
    const version = process.env.NEXT_PUBLIC_OFFLINE_BUILD;
    if (process.env.NODE_ENV !== 'production' || !version || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register(`/service-worker.js?v=${version}`).catch(() => {
      // Online use is still available when the browser cannot register a worker.
    });
  }, []);

  return null;
}

function subscribe(listener: () => void) {
  if (!('serviceWorker' in navigator)) return () => {};
  navigator.serviceWorker.addEventListener('controllerchange', listener);
  return () => navigator.serviceWorker.removeEventListener('controllerchange', listener);
}

function isOfflineReady() {
  return Boolean(navigator.serviceWorker?.controller);
}

function serverSnapshot() {
  return false;
}

export function OfflineStatus() {
  const ready = useSyncExternalStore(subscribe, isOfflineReady, serverSnapshot);
  return (
    <p role="status" className={ready ? 'text-sm font-semibold text-teal-800' : 'sr-only'}>
      {ready && 'Mode hors ligne prêt.'}
    </p>
  );
}
