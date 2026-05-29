'use client';

import { AppProvider } from '@/lib/context/AppContext';

export default function AppWrapper({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}
