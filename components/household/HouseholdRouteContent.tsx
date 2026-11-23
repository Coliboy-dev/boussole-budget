'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { householdCopy } from '@/lib/household-copy';
import { jointAccountRoutes, useHouseholdMovements } from './HouseholdMovementsContext';

export default function HouseholdRouteContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const household = useHouseholdMovements();
  const { hasJointAccount } = useApp();
  if (household && hasJointAccount === false && jointAccountRoutes.has(pathname)) {
    return <p className="px-4 py-6 text-sm text-slate-700">{householdCopy.noJointAccount}</p>;
  }
  return children;
}
