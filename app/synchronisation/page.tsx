'use client';

import CloudAccountSection from '@/components/sync/CloudAccountSection';
import LockSettings from '@/components/security/LockSettings';

export default function SynchronisationPage() {
  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-slate-900">Compte et sécurité</h1>
      <LockSettings />
      <h2 className="pt-2 text-lg font-bold text-slate-900">Synchroniser mes appareils</h2>
      <CloudAccountSection />
    </div>
  );
}
