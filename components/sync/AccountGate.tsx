'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useBudgetAccess } from '@/lib/budget-access';
import { managedBackupsEnabled } from '@/lib/cloud-remote';
import { useApp } from '@/lib/context/AppContext';
import { deviceAuthenticatorAvailable } from '@/lib/webauthn-lock';
import { accountSignupEnabled, useCloudSync } from './CloudSyncProvider';
import CloudAccountSection, { ChoosePassword } from './CloudAccountSection';
import BudgetOnboarding from '@/components/onboarding/BudgetOnboarding';
import { useLock } from '@/components/security/LockProvider';
import { InitialLockSetup } from '@/components/security/LockSettings';

const primary = 'min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white';
const secondary = 'min-h-11 rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-800';
const publicRoutes = new Set(['/demo', '/confidentialite', '/mentions-legales']);

/**
 * Proposé une fois après une connexion sur un appareil qui sait vérifier son propriétaire (Face ID, empreinte…).
 * Jamais imposé : « Plus tard » ouvre le budget directement.
 */
function DeviceLockOffer({ children }: { children: ReactNode }) {
  const { dismissDeviceLockOffer } = useCloudSync();
  // Un verrou déjà présent avant la proposition : rien à proposer. Celui créé pendant la proposition la laisse ouverte
  // pour l’étape Face ID.
  const [alreadyLocked] = useState(useLock().enabled);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (alreadyLocked) {
      dismissDeviceLockOffer();
      return;
    }
    let cancelled = false;
    void deviceAuthenticatorAvailable().then((result) => {
      if (cancelled) return;
      setAvailable(result);
      if (!result) dismissDeviceLockOffer();
    });
    return () => { cancelled = true; };
  }, [alreadyLocked, dismissDeviceLockOffer]);

  if (alreadyLocked || available === false) return children;
  if (available === null) return <p role="status" className="px-4 py-6 text-sm text-slate-700">Chargement…</p>;
  return (
    <main id="contenu" className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900">Ouvre l’app en un geste</h1>
      <p className="text-sm text-slate-700">
        Sur cet appareil, tu peux ouvrir l’app avec Face ID, ton empreinte ou un code à 6 chiffres, sans retaper ton mot de passe.
      </p>
      <InitialLockSetup onComplete={dismissDeviceLockOffer} />
      <button type="button" className={secondary} onClick={dismissDeviceLockOffer}>Plus tard</button>
    </main>
  );
}

export default function AccountGate({ children }: { children: ReactNode }) {
  const allowed = useBudgetAccess();
  const pathname = usePathname();
  const { phase, finishAccountBudget, signOut, beginSignIn, otpEmail, passwordRequired, offerDeviceLock } = useCloudSync();
  const { isCurrentBudget, isBudgetLoading, needsOnboarding } = useApp();
  const [chosen, setChosen] = useState(false);
  const stale = allowed && !isBudgetLoading && !isCurrentBudget();
  const managedSignupRoute = managedBackupsEnabled && accountSignupEnabled && !publicRoutes.has(pathname);
  const startingAccount = allowed && phase === 'signed-out' && needsOnboarding && managedSignupRoute;

  // Après un code e-mail (inscription ou récupération), le mot de passe est choisi avant tout le reste.
  if (passwordRequired) {
    return <main id="contenu" className="mx-auto max-w-lg px-4 py-6"><ChoosePassword /></main>;
  }
  if (allowed && isBudgetLoading && managedSignupRoute) return <p role="status" className="px-4 py-6 text-sm">Chargement du budget…</p>;
  if (allowed && !stale && !startingAccount) {
    return offerDeviceLock ? <DeviceLockOffer>{children}</DeviceLockOffer> : children;
  }
  if (startingAccount && !chosen && !otpEmail) {
    return (
      <main id="contenu" className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <h1 className="text-xl font-bold text-slate-900">Commence ton budget</h1>
        <p className="text-sm text-slate-700">Ton compte sauvegarde automatiquement ton budget. Tu pourras le retrouver sur un autre appareil avec ton e-mail et ton mot de passe.</p>
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
  if (phase === 'first-budget') {
    return <main id="contenu"><BudgetOnboarding onFinish={finishAccountBudget} onCancel={signOut} /></main>;
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
