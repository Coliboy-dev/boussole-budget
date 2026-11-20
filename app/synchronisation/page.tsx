'use client';

import { useState, type FormEvent } from 'react';
import { CloudOff, KeyRound, LockKeyhole, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import Card from '@/components/ui/Card';
import AlertBanner from '@/components/ui/AlertBanner';
import FormField from '@/components/forms/FormField';
import { Icon } from '@/components/ui/icons';
import { useCloudSync } from '@/components/sync/CloudSyncProvider';
import { MIN_PASSPHRASE_LENGTH } from '@/lib/cloud-crypto';

const fieldClass = 'w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-base';
const primaryButton = 'min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:bg-gray-400';
const secondaryButton = 'min-h-11 rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:border-gray-300 disabled:text-gray-500';

function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    setPending(true);
    setError('');
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Une erreur est survenue.');
    } finally {
      setPending(false);
    }
  }
  return { pending, error, run };
}

function ErrorText({ message }: { message: string }) {
  return message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null;
}

function Explanation() {
  return (
    <Card className="space-y-2 text-sm text-slate-700">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <Icon icon={ShieldCheck} className="size-5 text-teal-700" />
        Comment tes données sont protégées
      </h2>
      <p>Ton budget est chiffré sur ton appareil avec une phrase secrète que toi seul connais, avant d’être envoyé.</p>
      <p>Le serveur, hébergé dans l’Union européenne, ne reçoit qu’un bloc illisible : ni montant, ni créancier, ni date. Personne chez Start’OnLab ne peut le lire.</p>
      <p>Si tu oublies ta phrase secrète, la copie en ligne est perdue. Le budget de ton téléphone, lui, reste intact.</p>
    </Card>
  );
}

function SignIn() {
  const { sendCode, verifyCode } = useCloudSync();
  const [email, setEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const { pending, error, run } = useAction();

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    void run(async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Saisis une adresse e-mail valide.');
      await sendCode(value);
      setEmail(value);
      setCodeSent(true);
    });
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '');
    void run(async () => {
      if (!/^\d{6,10}$/.test(code)) throw new Error('Saisis le code reçu par e-mail.');
      await verifyCode(email, code);
    });
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">1. Te connecter</h2>
      {!codeSent ? (
        <form onSubmit={submitEmail} noValidate className="space-y-3">
          <FormField label="Adresse e-mail" required hint="Tu recevras un code de connexion. Aucun mot de passe à retenir.">
            <input name="email" type="email" autoComplete="email" inputMode="email" required className={fieldClass} />
          </FormField>
          <ErrorText message={error} />
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? 'Envoi…' : 'Recevoir un code'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} noValidate className="space-y-3">
          <p className="text-sm text-slate-700">Code envoyé à <strong>{email}</strong>. Il est valable une heure.</p>
          <FormField label="Code reçu par e-mail" required>
            <input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required
              className={`${fieldClass} tracking-widest`} />
          </FormField>
          <ErrorText message={error} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={primaryButton}>
              {pending ? 'Vérification…' : 'Me connecter'}
            </button>
            <button type="button" disabled={pending} onClick={() => setCodeSent(false)} className={secondaryButton}>
              Changer d’adresse
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

function Passphrase() {
  const { remoteExists, unlock, account, signOut, error: syncError } = useCloudSync();
  const { pending, error, run } = useAction();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const passphrase = String(data.get('passphrase') ?? '');
    const confirmation = String(data.get('confirmation') ?? '');
    void run(async () => {
      if (!remoteExists && passphrase !== confirmation) throw new Error('Les deux phrases secrètes ne correspondent pas.');
      await unlock(passphrase);
    });
  }

  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Icon icon={KeyRound} className="size-5 text-teal-700" />
        2. {remoteExists ? 'Saisir ta phrase secrète' : 'Choisir ta phrase secrète'}
      </h2>
      <p className="text-sm text-slate-700">
        {remoteExists
          ? 'Un budget chiffré existe déjà pour ce compte. Saisis la phrase secrète choisie sur ton autre appareil.'
          : `Au moins ${MIN_PASSPHRASE_LENGTH} caractères, par exemple quatre mots que tu retiendras. Note-la en lieu sûr : sans elle, personne ne pourra récupérer la copie en ligne.`}
      </p>
      <ErrorText message={syncError} />
      <form onSubmit={submit} noValidate className="space-y-3">
        <FormField label="Phrase secrète" required>
          <input name="passphrase" type="password" autoComplete={remoteExists ? 'current-password' : 'new-password'}
            required className={fieldClass} />
        </FormField>
        {!remoteExists && (
          <FormField label="Confirme la phrase secrète" required>
            <input name="confirmation" type="password" autoComplete="new-password" required className={fieldClass} />
          </FormField>
        )}
        <ErrorText message={error} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? 'Préparation du chiffrement…' : remoteExists ? 'Déverrouiller' : 'Activer la synchronisation'}
          </button>
          <button type="button" disabled={pending} onClick={() => void signOut()} className={secondaryButton}>
            Se déconnecter
          </button>
        </div>
      </form>
      {account && <p className="text-xs text-slate-600">Connecté avec {account.email}</p>}
    </Card>
  );
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('fr-BE', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('fr-BE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Brussels' })
    .format(new Date(value));
}

function Active() {
  const { phase, account, lastSyncedAt, conflictRemoteDate, error, syncNow, resolveConflict, signOut, deleteAccount } = useCloudSync();
  const action = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      {phase === 'conflict' ? (
        <AlertBanner variant="warning" title="Deux versions différentes de ton budget">
          <p>
            Ce téléphone et la copie en ligne
            {conflictRemoteDate && <> (modifiée le {formatDateTime(conflictRemoteDate)})</>} ont changé séparément.
            Choisis celle à garder : l’autre sera remplacée.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={action.pending} className={primaryButton}
              onClick={() => void action.run(() => resolveConflict('device'))}>
              Garder ce téléphone
            </button>
            <button type="button" disabled={action.pending} className={secondaryButton}
              onClick={() => void action.run(() => resolveConflict('cloud'))}>
              Garder la copie en ligne
            </button>
          </div>
        </AlertBanner>
      ) : (
        <Card className="space-y-3">
          <p role="status" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Icon icon={phase === 'error' ? TriangleAlert : phase === 'syncing' ? RefreshCw : LockKeyhole}
              className={`size-5 ${phase === 'error' ? 'text-red-700' : 'text-teal-700'}`} />
            {phase === 'syncing' && 'Synchronisation…'}
            {phase === 'synced' && `Synchronisé${lastSyncedAt ? ` à ${formatTime(lastSyncedAt)}` : ''}`}
            {phase === 'error' && 'Synchronisation interrompue'}
          </p>
          <p className="text-sm text-slate-700">
            Chaque modification est chiffrée puis envoyée automatiquement. Tes autres appareils se mettent à jour quand tu les ouvres.
          </p>
          <ErrorText message={error} />
          <button type="button" disabled={phase === 'syncing'} onClick={() => void syncNow()} className={secondaryButton}>
            Synchroniser maintenant
          </button>
        </Card>
      )}
      <ErrorText message={action.error} />

      <Card className="space-y-3 text-sm text-slate-700">
        <h2 className="text-base font-semibold text-slate-900">Compte</h2>
        {account && <p>Connecté avec <strong>{account.email}</strong></p>}
        <button type="button" disabled={action.pending} onClick={() => void action.run(signOut)} className={secondaryButton}>
          Se déconnecter de cet appareil
        </button>
        <p className="text-xs text-slate-600">Le budget reste sur ce téléphone. Il ne sera simplement plus synchronisé.</p>
        {!confirmDelete ? (
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="block min-h-11 text-sm font-semibold text-red-700 underline">
            Supprimer mon compte en ligne
          </button>
        ) : (
          <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-red-900">
              Le compte et la copie chiffrée seront supprimés définitivement du serveur. Le budget de ce téléphone est conservé.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={action.pending} onClick={() => void action.run(deleteAccount)}
                className="min-h-11 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800">
                Supprimer définitivement
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={secondaryButton}>Annuler</button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

export default function SynchronisationPage() {
  const { phase } = useCloudSync();

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-slate-900">Synchroniser mes appareils</h1>
      {phase === 'off' && (
        <Card className="flex items-start gap-3 text-sm text-slate-700">
          <Icon icon={CloudOff} className="size-5 shrink-0 text-slate-500" />
          <p>La synchronisation n’est pas disponible sur cette version. Ton budget reste enregistré sur cet appareil.</p>
        </Card>
      )}
      {phase === 'loading' && <p role="status" className="text-sm text-slate-600">Chargement…</p>}
      {phase !== 'off' && phase !== 'loading' && <Explanation />}
      {phase === 'signed-out' && <SignIn />}
      {phase === 'needs-passphrase' && <Passphrase />}
      {(phase === 'syncing' || phase === 'synced' || phase === 'conflict' || phase === 'error') && <Active />}
    </div>
  );
}
