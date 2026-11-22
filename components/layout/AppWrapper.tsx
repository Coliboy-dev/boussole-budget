'use client';

import { AppProvider } from '@/lib/context/AppContext';
import { CloudSyncProvider } from '@/components/sync/CloudSyncProvider';
import { LockProvider } from '@/components/security/LockProvider';
import HouseholdWorkspace from '@/components/household/HouseholdWorkspace';

export default function AppWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <CloudSyncProvider>
        <LockProvider><HouseholdWorkspace>{children}</HouseholdWorkspace></LockProvider>
      </CloudSyncProvider>
    </AppProvider>
  );
}
