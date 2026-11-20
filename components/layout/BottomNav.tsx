'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const mainNavItems = [
  { href: '/dashboard', label: 'Accueil', icon: '🏠' },
  { href: '/revenus', label: 'Revenus', icon: '💰' },
  { href: '/charges', label: 'Charges', icon: '📋' },
  { href: '/dettes', label: 'Dettes', icon: '💳' },
];

const moreNavItems = [
  { href: '/enfants', label: 'Enfants', icon: '👨‍👧‍👦' },
  { href: '/objectifs', label: 'Objectifs', icon: '🎯' },
  { href: '/projection', label: 'Échéancier', icon: '📅' },
  { href: '/conseils', label: 'Conseils', icon: '💡' },
  { href: '/sauvegarde', label: 'Sauvegarde', icon: '💾' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const isMoreActive = moreNavItems.some((item) => isActive(item.href));

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setShowMore(false)}
        />
      )}

      {/* More menu panel */}
      {showMore && (
        <div className="fixed bottom-20 left-0 right-0 z-50 max-w-2xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-2 grid grid-cols-3 gap-1">
            {moreNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setShowMore(false)}
                className={`flex flex-col items-center gap-1 py-3 px-1 rounded-xl transition-colors ${
                  isActive(item.href)
                    ? 'bg-teal-50 text-teal-700'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Bottom navigation bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-2xl mx-auto px-2 flex items-stretch h-16">
          {mainNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                isActive(item.href)
                  ? 'text-teal-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className={`text-xs font-medium ${isActive(item.href) ? 'text-teal-600' : 'text-gray-400'}`}>
                {item.label}
              </span>
              {isActive(item.href) && (
                <span className="absolute bottom-0 w-10 h-0.5 bg-teal-500 rounded-t-full" />
              )}
            </Link>
          ))}

          {/* More button */}
          <button
            onClick={() => setShowMore(!showMore)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
              isMoreActive ? 'text-teal-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="text-xl">⋯</span>
            <span className={`text-xs font-medium ${isMoreActive ? 'text-teal-600' : 'text-gray-400'}`}>
              Plus
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
