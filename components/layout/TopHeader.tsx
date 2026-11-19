'use client';

import { useApp } from '@/lib/context/AppContext';

export default function TopHeader() {
  const { userProfile } = useApp();
  const initial = Array.from(userProfile.firstName?.trim() ?? '')[0]?.toLocaleUpperCase('fr-BE');

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🧭</span>
            <span className="font-bold text-teal-700 text-lg tracking-tight">Boussole Budget</span>
          </div>
        </div>
        {initial && (
          <div aria-hidden="true" className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm">
            {initial}
          </div>
        )}
      </div>
    </header>
  );
}
