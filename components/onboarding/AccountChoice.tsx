'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import { useCloudSync } from '@/components/sync/CloudSyncProvider';

export default function AccountChoice({ onStartBudget }: { onStartBudget: () => void }) {
  const { beginSignIn } = useCloudSync();
  return (
    <div className="space-y-4 px-4 py-4 sm:py-8">
      <Card className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Comment veux-tu commencer ?</h1>
        <p className="text-sm text-slate-700">Tu peux créer ton budget directement sur cet appareil.</p>
        <button type="button" onClick={onStartBudget}
          className="flex min-h-11 w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
          Commencer mon budget
        </button>
        <Link href="/synchronisation" onClick={() => beginSignIn(false)}
          className="flex min-h-11 items-center justify-center rounded-xl border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800">
          J’ai déjà un compte
        </Link>
      </Card>
      <div className="flex flex-wrap gap-4 text-sm font-medium text-teal-800">
        <Link href="/sauvegarde" className="inline-flex min-h-11 items-center underline">Restaurer une sauvegarde</Link>
        <Link href="/demo" prefetch={false} className="inline-flex min-h-11 items-center underline">Voir la démo</Link>
      </div>
    </div>
  );
}
