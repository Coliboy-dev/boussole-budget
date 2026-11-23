'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { CalendarDays, Ellipsis, House, Wallet } from 'lucide-react';
import { Icon } from '@/components/ui/icons';
import { useHouseholdMovements } from '@/components/household/HouseholdMovementsContext';
import { useApp } from '@/lib/context/AppContext';

const items = [
  { href: '/dashboard', label: 'Aujourd’hui', icon: House, routes: ['/'] },
  { href: '/projection', label: 'Échéances', icon: CalendarDays, routes: [] },
  { href: '/budget', label: 'Budget', icon: Wallet, routes: ['/revenus', '/charges', '/depenses', '/analyse', '/dettes', '/enfants', '/objectifs', '/simulation'] },
  { href: '/plus', label: 'Plus', icon: Ellipsis, routes: ['/foyer', '/foyer/mouvements', '/reglages', '/demo', '/conseils', '/sauvegarde', '/synchronisation', '/confidentialite', '/mentions-legales'] },
];

export default function BottomNav() {
  const pathname = usePathname();
  const household = useHouseholdMovements();
  const { hasJointAccount } = useApp();
  const noJointAccount = !!household && hasJointAccount === false;
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const anchor = document.getElementById(window.location.hash.slice(1));
    (anchor ?? document.getElementById('contenu'))?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-lg">
      <div className={`mx-auto grid h-16 max-w-2xl px-2 ${noJointAccount ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {items.filter(({ href }) => !noJointAccount || href !== '/projection').map(({ href, label, icon, routes }) => {
          const active = pathname === href || routes.some((route) => route === pathname);

          return (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? 'page' : active ? 'location' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 rounded-t-lg text-xs font-semibold focus-visible:z-10 ${active ? 'bg-teal-50 text-teal-800' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <Icon icon={icon} className="size-6" strokeWidth={active ? 2.2 : 1.85} />
              {label}
              {active && <span className="absolute bottom-0 h-0.5 w-10 rounded-t-full bg-teal-700" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
