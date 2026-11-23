'use client';

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import AccountGate from '@/components/sync/AccountGate';
import { useCloudSync } from '@/components/sync/CloudSyncProvider';
import { AUTH_STORAGE_KEY, readStoredSessionUserId } from '@/lib/account-guard';
import { useBudgetAccess } from '@/lib/budget-access';
import { householdCopy } from '@/lib/household-copy';
import { householdEnabled } from '@/lib/household-feature';
import {
  acceptInvitation, assertHouseholdAccount, createHousehold, leaveHousehold, listHouseholds, stopSharingWith,
} from '@/lib/household-remote';
import {
  emptyDirectory, householdDirectory, keepFormerHouseholdCopy, mergeHouseholdDirectory, type HouseholdDirectory,
} from '@/lib/household-storage';
import HouseholdBudget from './HouseholdBudget';

const sharedRoutes = new Set([
  '/', '/dashboard', '/projection', '/budget', '/revenus', '/charges', '/depenses', '/analyse',
  '/dettes', '/enfants', '/objectifs', '/simulation', '/plus', '/foyer', '/foyer/mouvements', '/conseils',
]);

interface Workspace {
  userId: string | null;
  inHouseholdShell: boolean;
  active: boolean;
  memberId?: string;
  directory: HouseholdDirectory;
  loading: boolean;
  error: string;
  create: () => Promise<void>;
  select: (id: string | null, navigate?: boolean) => Promise<void>;
  /** Accepte une invitation puis ouvre le foyer rejoint. */
  join: (invitationId: string, token: string) => Promise<void>;
  /** Quitte le foyer ouvert : la synchronisation s'arrête, la copie chiffrée reste sur l'appareil. */
  leave: () => Promise<void>;
  stopSharing: (memberId: string) => Promise<void>;
  /** Relit l'annuaire local (après l'effacement d'une copie, par exemple), sans appel réseau. */
  reloadStored: () => void;
}

const Context = createContext<Workspace>({
  userId: null, inHouseholdShell: false, active: false, directory: emptyDirectory, loading: false, error: '',
  create: () => Promise.resolve(),
  select: () => Promise.resolve(),
  join: () => Promise.resolve(),
  leave: () => Promise.resolve(),
  stopSharing: () => Promise.resolve(),
  reloadStored: () => undefined,
});
const noStoredSession = () => null;
const storedSession = () => readStoredSessionUserId(localStorage);

function subscribeSession(listener: () => void) {
  const checkStorage = (event: StorageEvent) => {
    if (!event.key || event.key === AUTH_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', checkStorage);
  window.addEventListener('pageshow', listener);
  document.addEventListener('visibilitychange', listener);
  return () => {
    window.removeEventListener('storage', checkStorage);
    window.removeEventListener('pageshow', listener);
    document.removeEventListener('visibilitychange', listener);
  };
}

export function useHouseholdWorkspace(): Workspace {
  return useContext(Context);
}

export default function HouseholdWorkspace({ children }: { children: ReactNode }) {
  if (!householdEnabled) return <AccountGate>{children}</AccountGate>;
  return <EnabledHouseholdWorkspace>{children}</EnabledHouseholdWorkspace>;
}

function EnabledHouseholdWorkspace({ children }: { children: ReactNode }) {
  const { account, passwordRequired, offerDeviceLock } = useCloudSync();
  const personalBudgetAccessible = useBudgetAccess();
  const storedUserId = useSyncExternalStore(subscribeSession, storedSession, noStoredSession);
  const userId = account && account.userId === storedUserId && !passwordRequired && !offerDeviceLock ? account.userId : null;
  const pathname = usePathname();
  const router = useRouter();
  const [directoryView, setDirectory] = useState<{ userId: string; directory: HouseholdDirectory }>();
  const [errorView, setError] = useState<{ userId: string; message: string }>();

  const readDirectory = useCallback((id: string, directory: HouseholdDirectory) => {
    assertHouseholdAccount(id);
    setDirectory({ userId: id, directory });
  }, []);

  const refresh = useCallback(async (id: string) => {
    const households = await listHouseholds(id);
    const directory = await householdDirectory(id, current => {
      assertHouseholdAccount(id);
      return mergeHouseholdDirectory(current, households, new Date().toISOString());
    });
    readDirectory(id, directory);
    setError(undefined);
    return directory;
  }, [readDirectory]);

  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    const report = (error: unknown) => {
      if (!disposed) setError({ userId, message: error instanceof Error ? error.message : householdCopy.unavailable });
    };
    const update = () => { if (navigator.onLine) void refresh(userId).catch(report); };
    void householdDirectory(userId).then(directory => {
      if (disposed) return;
      readDirectory(userId, directory);
      update();
    }).catch(report);
    window.addEventListener('online', update);
    return () => {
      disposed = true;
      window.removeEventListener('online', update);
    };
  }, [readDirectory, refresh, userId]);

  const directory = userId && directoryView?.userId === userId ? directoryView.directory : emptyDirectory;
  const selected = directory.selected;
  const membership = directory.households.find(({ id }) => id === selected);
  const memberId = membership?.memberId;
  const active = !!(userId && selected && sharedRoutes.has(pathname));
  const inHouseholdShell = !!(userId && (active || pathname === '/foyer'));

  async function select(id: string | null, navigate = true) {
    if (!userId) return;
    try {
      const next = await householdDirectory(userId, (current) => {
        assertHouseholdAccount(userId);
        if (id && !current.households.some(household => household.id === id)) throw new Error(householdCopy.unavailable);
        return { ...current, selected: id };
      });
      readDirectory(userId, next);
      if (navigate && (id || pathname === '/foyer' || pathname === '/foyer/mouvements')) router.push('/dashboard');
    } catch (error) {
      setError({ userId, message: error instanceof Error ? error.message : householdCopy.unavailable });
    }
  }

  async function create() {
    if (!userId) return;
    try {
      setError(undefined);
      const id = await createHousehold(userId);
      await refresh(userId);
      await select(id);
    } catch (error) {
      setError({ userId, message: error instanceof Error ? error.message : householdCopy.unavailable });
    }
  }

  // Après un refus d'accès, l'annuaire local a déjà été mis à jour : on le relit sans attendre la liste du serveur.
  const reloadStoredDirectory = useCallback(() => {
    if (!userId) return;
    void householdDirectory(userId).then(directory => readDirectory(userId, directory)).catch(() => undefined);
  }, [readDirectory, userId]);

  // Les actions de partage laissent l'appelant afficher l'erreur dans son propre formulaire.
  async function join(invitationId: string, token: string) {
    if (!userId) throw new Error(householdCopy.joinSignIn);
    const id = await acceptInvitation(userId, invitationId, token);
    await refresh(userId);
    await select(id);
  }

  async function leave() {
    if (!userId || !selected) return;
    await leaveHousehold(userId, selected);
    readDirectory(userId, await keepFormerHouseholdCopy(userId, selected, new Date().toISOString()));
    await refresh(userId).catch(() => undefined);
  }

  async function stopSharing(otherMemberId: string) {
    if (!userId || !selected) return;
    await stopSharingWith(userId, selected, otherMemberId);
    await refresh(userId);
  }

  return (
    <Context.Provider value={{
      userId, inHouseholdShell, active, memberId, directory,
      loading: !!userId && directoryView?.userId !== userId && errorView?.userId !== userId,
      error: userId && errorView?.userId === userId ? errorView.message : '',
      create, select, join, leave, stopSharing, reloadStored: reloadStoredDirectory,
    }}>
      {active && userId && selected ? (
        <HouseholdBudget key={`${userId}:${selected}`} userId={userId} householdId={selected}
          memberId={memberId} activeMemberIds={membership?.activeMemberIds} onExit={() => { void select(null); }}
          onRevoked={reloadStoredDirectory}>
          {pathname === '/conseils' ? (
            <main id="contenu" className="mx-auto max-w-2xl px-4 py-6">
              <p>{householdCopy.advicePersonal}</p>
              <button type="button" onClick={() => { void select(null, false); }} className="min-h-11 font-semibold text-teal-800 underline">
                {householdCopy.personal}
              </button>
            </main>
          ) : children}
        </HouseholdBudget>
      ) : inHouseholdShell ? children : (
        <>
          {userId && directory.households.length > 0 && !personalBudgetAccessible && (
            <Link href="/foyer" className="mx-auto flex min-h-11 max-w-lg items-center px-4 text-sm font-semibold text-teal-800 underline">
              {householdCopy.household}
            </Link>
          )}
          <AccountGate>{children}</AccountGate>
        </>
      )}
    </Context.Provider>
  );
}
