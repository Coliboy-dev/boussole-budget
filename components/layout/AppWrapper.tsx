'use client';

import { AppProvider } from '@/lib/context/AppContext';
import { CloudSyncProvider } from '@/components/sync/CloudSyncProvider';
import { LockProvider } from '@/components/security/LockProvider';

export default function AppWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <CloudSyncProvider>
        <LockProvider>{children}</LockProvider>
      </CloudSyncProvider>
    </AppProvider>
  );
}
