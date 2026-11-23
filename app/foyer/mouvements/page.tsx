'use client';

import Link from 'next/link';
import { HouseholdContributionList } from '@/components/household/HouseholdContributions';
import { useHouseholdWorkspace } from '@/components/household/HouseholdWorkspace';
import { householdCopy } from '@/lib/household-copy';
import { householdEnabled } from '@/lib/household-feature';

export default function HouseholdMovementsPage() {
  const { active } = useHouseholdWorkspace();

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-slate-900">{householdCopy.household}</h1>
      {!householdEnabled ? <p>{householdCopy.comingSoon}</p> : active
        ? <HouseholdContributionList month />
        : <Link href="/foyer" className="inline-flex min-h-11 items-center font-semibold text-teal-800 underline">{householdCopy.open}</Link>}
    </div>
  );
}
