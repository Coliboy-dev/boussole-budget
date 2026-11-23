'use client';

import Link from 'next/link';
import { HouseholdContributionList } from '@/components/household/HouseholdContributions';
import HouseholdTransfers from '@/components/household/HouseholdTransfers';
import { useHouseholdWorkspace } from '@/components/household/HouseholdWorkspace';
import { householdCopy } from '@/lib/household-copy';
import { householdEnabled } from '@/lib/household-feature';
import { useApp } from '@/lib/context/AppContext';

export default function HouseholdMovementsPage() {
  const { active } = useHouseholdWorkspace();
  const { hasJointAccount } = useApp();

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-slate-900">{householdCopy.movements}</h1>
      {!householdEnabled ? <p>{householdCopy.comingSoon}</p> : active
        ? <>{hasJointAccount !== false && <HouseholdContributionList month />}<HouseholdTransfers /></>
        : <Link href="/foyer" className="inline-flex min-h-11 items-center font-semibold text-teal-800 underline">{householdCopy.open}</Link>}
    </div>
  );
}
