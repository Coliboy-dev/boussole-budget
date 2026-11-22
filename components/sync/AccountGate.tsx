'use client';

import type { ReactNode } from 'react';
import { useBudgetAccess } from '@/lib/budget-access';
import { useApp } from '@/lib/context/AppContext';
import { useCloudSync } from './CloudSyncProvider';
import CloudAccountSection from './CloudAccountSection';
import BudgetOnboarding from '@/components/onboarding/BudgetOnboarding';

export default function AccountGate({ children }: { children: ReactNode }) {
  const allowed = useBudgetAccess();
  const { phase, finishAccountBudget, signOut } = useCloudSync();
  const { isCurrentBudget, isBudgetLoading } = useApp();
  const stale = allowed && !isBudgetLoading && !isCurrentBudget();

  if (allowed && !stale) return children;
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
        <CloudAccountSection protectedBudget />
      )}
    </main>
  );
}
