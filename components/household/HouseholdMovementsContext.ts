'use client';

import { createContext, useContext } from 'react';
import type { HouseholdTransfer } from '@/lib/household-movements';

type MovementInput = { amount: number; date: string };
export const jointAccountRoutes = new Set(['/projection', '/simulation', '/revenus', '/charges', '/dettes', '/enfants']);
export interface HouseholdMovements {
  memberId?: string;
  partnerId?: string;
  transfers: HouseholdTransfer[];
  memberName: (memberId: string) => string;
  setHasJointAccount: (enabled: boolean) => void;
  declare: (input: MovementInput, previous?: HouseholdTransfer) => void;
  reply: (transfer: HouseholdTransfer, status: 'confirmed' | 'not_received') => void;
  remove: (transfer: HouseholdTransfer) => void;
}

export const HouseholdMovementsContext = createContext<HouseholdMovements | undefined>(undefined);

export function useHouseholdMovements() {
  return useContext(HouseholdMovementsContext);
}
