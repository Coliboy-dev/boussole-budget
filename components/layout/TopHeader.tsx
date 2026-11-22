'use client';

import Link from 'next/link';
import { LockKeyhole, Settings } from 'lucide-react';
import BrandLogo from '@/components/ui/BrandLogo';
import { Icon } from '@/components/ui/icons';
import { useApp } from '@/lib/context/AppContext';
import { useLock } from '@/components/security/LockProvider';
import { useHouseholdWorkspace } from '@/components/household/HouseholdWorkspace';
import { householdCopy } from '@/lib/household-copy';
import { useRouter } from 'next/navigation';

export default function TopHeader() {
  const { userProfile } = useApp();
  const lock = useLock();
  const workspace = useHouseholdWorkspace();
  const router = useRouter();
  const initial = workspace.inHouseholdShell ? undefined : Array.from(userProfile.firstName?.trim() ?? '')[0]?.toLocaleUpperCase('fr-BE');

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center">
          <BrandLogo height={34} priority />
        </div>
        <div className="flex items-center gap-1">
        {lock.enabled && (
          <button
            type="button"
            onClick={lock.lockNow}
            aria-label="Verrouiller Capiste"
            className="flex size-11 items-center justify-center rounded-full text-teal-800 hover:bg-teal-50"
          >
            <Icon icon={LockKeyhole} className="size-5" />
          </button>
        )}
        <Link
          href={workspace.inHouseholdShell ? '/foyer' : '/reglages'}
          aria-label="Réglages"
          className="flex size-11 items-center justify-center rounded-full text-sm font-bold text-teal-800 hover:bg-teal-50"
        >
          {initial ? (
            <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-teal-100">{initial}</span>
          ) : (
            <Icon icon={Settings} className="size-5 text-slate-600" />
          )}
        </Link>
        </div>
      </div>
      {workspace.userId && <div role="group" aria-label={householdCopy.switcher} className="mx-auto flex max-w-2xl gap-2 px-4 pb-2">
        <button type="button" aria-pressed={!workspace.inHouseholdShell}
          onClick={() => { void workspace.select(null); }}
          className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold aria-pressed:bg-teal-700 aria-pressed:text-white">
          {householdCopy.personal}
        </button>
        <button type="button" aria-pressed={workspace.inHouseholdShell}
          onClick={() => {
            const first = workspace.directory.selected ?? workspace.directory.households[0]?.id;
            if (first) void workspace.select(first);
            else router.push('/foyer');
          }}
          className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold aria-pressed:bg-teal-700 aria-pressed:text-white">
          {householdCopy.household}
        </button>
      </div>}
    </header>
  );
}
