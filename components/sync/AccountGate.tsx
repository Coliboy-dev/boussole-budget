'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useBudgetAccess } from '@/lib/budget-access';
import { managedBackupsEnabled } from '@/lib/cloud-remote';
import { useApp } from '@/lib/context/AppContext';
import { accountSignupEnabled, useCloudSync } from './CloudSyncProvider';
import CloudAccountSection from './CloudAccountSection';
import BudgetOnboarding from '@/components/onboarding/BudgetOnboarding';
import { useLock } from '@/components/security/LockProvider';
import { InitialLockSetup } from '@/components/security/LockSettings';

const primary = 'min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white';
const secondary = 'min-h-11 rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-800';
const publicRoutes = new Set(['/demo', '/confidentialite', '/mentions-legales']);

function RequireDeviceLock({ children }: { children: ReactNode }) {
  const { enabled } = useLock();
  const [ready, setReady] = useState(enabled);
  return ready && enabled ? children : <InitialLockSetup onComplete={() => setReady(true)} />;
}

function RestoreAfterLock() {
  const { associate, refreshAccount, signOut } = useCloudSync();
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void associate('restore').catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Le budget n’a pas pu être récupéré.');
    });
  }, [associate]);

  if (!error) return <p role="status" className="text-sm text-slate-700">Récupération de ton budget…</p>;
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-red-700">{error}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={() => void refreshAccount()}>Réessayer</button>
        <button type="button" className={secondary} onClick={() => void signOut()}>Se déconnecter</button>
      </div>
    </div>
  );
}

export default function AccountGate({ children }: { children: ReactNode }) {
  const allowed = useBudgetAccess();
  const pathname = usePathname();
  const { phase, finishAccountBudget, signOut, beginSignIn, otpEmail } = useCloudSync();
  const { isCurrentBudget, isBudgetLoading, needsOnboarding } = useApp();
  const [chosen, setChosen] = useState(false);
  const stale = allowed && !isBudgetLoading && !isCurrentBudget();
  const managedSignupRoute = managedBackupsEnabled && accountSignupEnabled && !publicRoutes.has(pathname);
  const startingAccount = allowed && phase === 'signed-out' && needsOnboarding && managedSignupRoute;

  if (allowed && isBudgetLoading && managedSignupRoute) return <p role="status" className="px-4 py-6 text-sm">Chargement du budget…</p>;
  if (allowed && !stale && !startingAccount) return children;
  if (startingAccount && !chosen && !otpEmail) {
    return (
      <main id="contenu" className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <h1 className="text-xl font-bold text-slate-900">Commence ton budget</h1>
        <p className="text-sm text-slate-700">Ton compte sauvegarde automatiquement ton budget. Tu pourras le retrouver sur un autre appareil avec ton e-mail.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primary} onClick={() => { beginSignIn(true); setChosen(true); }}>Créer mon compte</button>
          <button type="button" className={secondary} onClick={() => { beginSignIn(false); setChosen(true); }}>J’ai déjà un compte</button>
        </div>
        <p className="flex flex-wrap gap-4 text-sm text-teal-800">
          <Link href="/demo" className="underline">Voir la démo</Link>
          <Link href="/confidentialite" className="underline">Confidentialité</Link>
        </p>
      </main>
    );
  }
  if (phase === 'first-budget' && !managedBackupsEnabled) {
    return <main id="contenu"><BudgetOnboarding onFinish={finishAccountBudget} onCancel={signOut} /></main>;
  }
  if (managedBackupsEnabled && (phase === 'first-budget' || phase === 'restore-after-lock' || phase === 'awaiting-association')) {
    return (
      <main id="contenu" className="mx-auto max-w-lg px-4 py-6">
        <RequireDeviceLock>
          {phase === 'first-budget' ? <BudgetOnboarding onFinish={finishAccountBudget} onCancel={signOut} />
            : phase === 'restore-after-lock' ? <RestoreAfterLock /> : <CloudAccountSection protectedBudget />}
        </RequireDeviceLock>
      </main>
    );
  }

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto w-full max-w-lg space-y-4 px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900">Compte et sécurité</h1>
      {stale ? (
        <>
          <p className="text-sm text-slate-700">Recharge la page pour ouvrir le budget enregistré sur cet appareil.</p>
          <button type="button" onClick={() => window.location.reload()}
            className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white">
            Recharger la page
          </button>
        </>
      ) : phase === 'syncing' || phase === 'synced' || phase === 'conflict' || phase === 'error' || phase === 'off' ? (
        <p role="status" className="text-sm text-slate-700">Vérification du compte…</p>
      ) : (
        <CloudAccountSection protectedBudget startingAccount={startingAccount} />
      )}
    </main>
  );
}
