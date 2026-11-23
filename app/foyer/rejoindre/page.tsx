'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { useHouseholdWorkspace } from '@/components/household/HouseholdWorkspace';
import Card from '@/components/ui/Card';
import { householdCopy } from '@/lib/household-copy';
import { householdEnabled } from '@/lib/household-feature';
import { parseInvitationHash } from '@/lib/household-invitations';

const primary = 'inline-flex min-h-11 items-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-50';

/**
 * Accepter une invitation : l'identifiant et le jeton restent dans le fragment (#), jamais envoyé au serveur web.
 * Le fragment est retiré de l'adresse dès que la personne choisit de rejoindre le foyer.
 */
function subscribeHash(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
const readHash = () => window.location.hash;
const noHash = () => null;

export default function JoinHouseholdPage() {
  const { userId, join } = useHouseholdWorkspace();
  // Le fragment n'existe que dans le navigateur ; un lien collé dans le même onglet est relu.
  const hash = useSyncExternalStore(subscribeHash, readHash, noHash);
  // Une fois la demande envoyée, l'invitation est gardée en mémoire et le fragment retiré de l'adresse.
  const [sent, setSent] = useState<{ invitationId: string; token: string }>();
  const invitation = sent ?? (hash === null ? undefined : parseInvitationHash(hash));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!householdEnabled) {
    return (
      <div className="space-y-4 px-4 py-4">
        <h1 className="text-xl font-bold text-slate-900">{householdCopy.joinTitle}</h1>
        <p>{householdCopy.comingSoon}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-slate-900">{householdCopy.joinTitle}</h1>
      {invitation === undefined ? (
        <p role="status">{householdCopy.loading}</p>
      ) : invitation === null ? (
        <p role="alert" className="text-sm text-rose-800">{householdCopy.joinInvalidLink}</p>
      ) : !userId ? (
        <Card className="space-y-3">
          <p>{householdCopy.joinSignIn}</p>
          <Link href="/synchronisation" className={primary}>{householdCopy.openAccount}</Link>
        </Card>
      ) : (
        <Card className="space-y-3">
          <p className="text-sm text-slate-700">{householdCopy.joinHelp}</p>
          <button type="button" className={primary} disabled={busy} onClick={() => {
            setBusy(true);
            setError('');
            // Le jeton est gardé en mémoire : on le retire de l'adresse et de l'historique avant de quitter la page.
            setSent(invitation);
            history.replaceState(null, '', window.location.pathname);
            void join(invitation.invitationId, invitation.token)
              .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : householdCopy.invitationInvalid))
              .finally(() => setBusy(false));
          }}>{householdCopy.join}</button>
          {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
        </Card>
      )}
    </div>
  );
}
