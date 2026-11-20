'use client';

import { AppProvider } from '@/lib/context/AppContext';
import { CloudSyncProvider } from '@/components/sync/CloudSyncProvider';

export default function AppWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <CloudSyncProvider>{children}</CloudSyncProvider>
    </AppProvider>
  );
}
