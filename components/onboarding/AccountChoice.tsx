'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import { useCloudSync } from '@/components/sync/CloudSyncProvider';
import { managedBackupsEnabled } from '@/lib/cloud-remote';

export default function AccountChoice({ onGuest }: { onGuest: () => void }) {
  const { beginSignIn } = useCloudSync();
  return (
    <div className="space-y-4 px-4 py-4 sm:py-8">
      <Card className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Comment veux-tu commencer ?</h1>
        <p className="text-sm text-slate-700">
          Avec un compte, tu peux retrouver ton budget sur plusieurs appareils.{' '}
          {managedBackupsEnabled
            ? 'La copie en ligne est chiffrée avec une clé gérée par Start’OnLab.'
            : 'La copie en ligne est chiffrée sur ton téléphone avant l’envoi, et nous ne pouvons pas la lire.'}
        </p>
        <Link href="/synchronisation" onClick={() => beginSignIn(true)}
          className="flex min-h-11 items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
          Créer mon compte
        </Link>
        <Link href="/synchronisation" onClick={() => beginSignIn(false)}
          className="flex min-h-11 items-center justify-center rounded-xl border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800">
          J’ai déjà un compte
        </Link>
        <div className="text-sm text-slate-700">
          <button type="button" onClick={onGuest} className="min-h-11 font-semibold text-teal-800 underline">Continuer sans compte</button>
          <p>Ton budget reste sur cet appareil. Tu peux créer un compte plus tard.</p>
        </div>
      </Card>
      <div className="flex flex-wrap gap-4 text-sm font-medium text-teal-800">
        <Link href="/sauvegarde" className="inline-flex min-h-11 items-center underline">Restaurer une sauvegarde</Link>
        <Link href="/demo" prefetch={false} className="inline-flex min-h-11 items-center underline">Voir la démo</Link>
      </div>
    </div>
  );
}
