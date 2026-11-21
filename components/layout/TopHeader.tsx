'use client';

import Link from 'next/link';
import { Compass, LockKeyhole, Settings } from 'lucide-react';
import { Icon } from '@/components/ui/icons';
import { useApp } from '@/lib/context/AppContext';
import { useLock } from '@/components/security/LockProvider';

export default function TopHeader() {
  const { userProfile } = useApp();
  const lock = useLock();
  const initial = Array.from(userProfile.firstName?.trim() ?? '')[0]?.toLocaleUpperCase('fr-BE');

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-[10px] border border-teal-200 bg-teal-50 text-teal-700">
            <Icon icon={Compass} />
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-teal-800">Boussole Budget</span>
        </div>
        <div className="flex items-center gap-1">
        {lock.enabled && (
          <button
            type="button"
            onClick={lock.lockNow}
            aria-label="Verrouiller Boussole"
            className="flex size-11 items-center justify-center rounded-full text-teal-800 hover:bg-teal-50"
          >
            <Icon icon={LockKeyhole} className="size-5" />
          </button>
        )}
        <Link
          href="/reglages"
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
    </header>
  );
}
