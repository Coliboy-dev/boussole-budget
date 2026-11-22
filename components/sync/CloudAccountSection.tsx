'use client';

import { useState, type FormEvent } from 'react';
import { CloudOff, KeyRound, LockKeyhole, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import Card from '@/components/ui/Card';
import AlertBanner from '@/components/ui/AlertBanner';
import FormField from '@/components/forms/FormField';
import { Icon } from '@/components/ui/icons';
import { accountSignupEnabled, useCloudSync } from '@/components/sync/CloudSyncProvider';
import { MIN_PASSPHRASE_LENGTH } from '@/lib/cloud-crypto';
import { managedBackupsEnabled } from '@/lib/cloud-remote';
import { generatePassphrase } from '@/lib/passphrase';

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
      {managedBackupsEnabled ? (
        <p>Les nouvelles copies en ligne sont chiffrées avec une clé gérée par Start’OnLab. Ton code reçu par e-mail permet de les ouvrir sur un autre appareil. Les anciennes copies protégées par une phrase gardent leur mode de récupération.</p>
      ) : (
        <>
          <p>La copie de ton budget envoyée en ligne est chiffrée sur ton appareil, avec une phrase secrète que toi seul connais, avant d’être envoyée.</p>
          <p>Le serveur, hébergé dans l’Union européenne, ne reçoit qu’un bloc illisible : ni montant, ni créancier, ni date. Personne chez Start’OnLab ne peut le lire.</p>
          <p>Si tu oublies ta phrase secrète, la copie en ligne est perdue. Le budget de ton téléphone, lui, reste intact.</p>
        </>
      )}
    </Card>
  );
}

function SignIn() {
  const { sendCode, verifyCode, otpEmail, resetCode, signingUp, error: syncError } = useCloudSync();
  const { pending, error, run } = useAction();

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    void run(async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Saisis une adresse e-mail valide.');
      await sendCode(value);
    });
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '');
    void run(async () => {
      if (!/^\d{6,10}$/.test(code)) throw new Error('Saisis le code reçu par e-mail.');
      await verifyCode(otpEmail, code);
    });
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">{signingUp ? 'Créer mon compte' : '1. Te connecter'}</h2>
      {!otpEmail ? (
        <form onSubmit={submitEmail} noValidate className="space-y-3">
          <FormField label="Adresse e-mail" required hint="Tu recevras un code de connexion. Aucun mot de passe à retenir.">
            <input name="email" type="email" autoComplete="email" inputMode="email" required className={fieldClass} />
          </FormField>
          <ErrorText message={error || syncError} />
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? 'Envoi…' : 'Recevoir un code'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} noValidate className="space-y-3">
          <p className="text-sm text-slate-700">Code envoyé à <strong>{otpEmail}</strong>. Utilise le dernier code reçu.</p>
          <FormField label="Code reçu par e-mail" required>
            <input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required
              className={`${fieldClass} tracking-widest`} />
          </FormField>
          <ErrorText message={error || syncError} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={primaryButton}>
              {pending ? 'Vérification…' : signingUp ? 'Confirmer mon adresse' : 'Me connecter'}
            </button>
            <button type="button" disabled={pending} onClick={resetCode} className={secondaryButton}>
              Changer d’adresse
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

function NewPassphrase() {
  const { account, unlock, signOut, error: syncError } = useCloudSync();
  const { pending, error, run } = useAction();
  const [phrase, setPhrase] = useState(generatePassphrase);
  const [custom, setCustom] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saved) void run(() => unlock(phrase, true));
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Enregistre ta phrase secrète</h2>
      <p className="text-sm text-slate-700">Si tu perds tous tes appareils et cette phrase, personne ne pourra récupérer ta copie en ligne, pas même nous.</p>
      <form className="space-y-3" onSubmit={submit}>
        <FormField label="Adresse e-mail">
          <input name="username" type="email" autoComplete="username" readOnly value={account?.email ?? ''} className={fieldClass} />
        </FormField>
        {!custom && <p className="break-words rounded-lg bg-teal-50 px-3 py-2 font-mono text-base font-semibold text-teal-900">{phrase}</p>}
        <FormField label="Phrase secrète" required hint={custom ? `Choisis au moins ${MIN_PASSPHRASE_LENGTH} caractères.` : undefined}>
          <input name="passphrase" type="password" autoComplete="new-password" required
            minLength={MIN_PASSPHRASE_LENGTH} readOnly={!custom} spellCheck={false} value={phrase} className={fieldClass}
            onChange={(event) => { setPhrase(event.target.value); setSaved(false); setCopied(false); }} />
        </FormField>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} className={secondaryButton} onClick={() => void run(async () => {
            await navigator.clipboard.writeText(phrase);
            setCopied(true);
          })}>Copier</button>
          <button type="button" disabled={pending} className={secondaryButton} onClick={() => {
            setCustom(!custom);
            setPhrase(custom ? generatePassphrase() : '');
            setSaved(false);
            setCopied(false);
          }}>{custom ? 'Générer une phrase' : 'Choisir ma propre phrase'}</button>
        </div>
        {copied && <p role="status" className="text-sm text-teal-800">Phrase copiée.</p>}
        <label className="flex items-start gap-2 text-sm text-slate-800">
          <input type="checkbox" required checked={saved} onChange={(event) => setSaved(event.target.checked)} />
          J’ai enregistré ma phrase secrète dans mon gestionnaire de mots de passe ou dans un endroit sûr
        </label>
        <ErrorText message={error || syncError} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || !saved} className={primaryButton}>Continuer</button>
          <button type="button" disabled={pending} onClick={() => void run(signOut)} className={secondaryButton}>Se déconnecter</button>
        </div>
      </form>
    </Card>
  );
}

function Passphrase() {
  const { remoteExists, unlock, account, signOut, refreshAccount, signingUp, error: syncError } = useCloudSync();
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

  if (remoteExists === null) {
    return (
      <Card className="space-y-3">
        <p role="status" className="text-sm">{syncError || 'Vérification de la copie en ligne…'}</p>
        <ErrorText message={error} />
        <div className="flex flex-wrap gap-2">
          {syncError && <button type="button" disabled={pending} className={primaryButton}
            onClick={() => void run(refreshAccount)}>Réessayer</button>}
          <button type="button" disabled={pending} className={secondaryButton}
            onClick={() => void run(signOut)}>Se déconnecter</button>
        </div>
      </Card>
    );
  }

  if (signingUp && !remoteExists) return <NewPassphrase />;

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
          <button type="button" disabled={pending} onClick={() => void run(signOut)} className={secondaryButton}>
            Se déconnecter
          </button>
        </div>
      </form>
      {account && <p className="text-xs text-slate-600">Connecté avec {account.email}</p>}
    </Card>
  );
}

function AssociationChoice() {
  const { associate, signOut, remoteExists, associationEmpty, account, refreshAccount } = useCloudSync();
  const { error, pending, run } = useAction();
  const [confirmation, setConfirmation] = useState<'restore' | 'start-empty'>();

  return (
    <Card className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Choisir le budget de ce compte</h2>
      {account && <p className="text-sm text-slate-700">Compte connecté <strong>{account.email}</strong></p>}
      {confirmation ? (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-950">
            {confirmation === 'restore'
              ? 'La copie en ligne de ton compte remplacera le budget local.'
              : 'Le budget local actuel sera remplacé par un budget vide.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} className={primaryButton}
              onClick={() => void run(() => associate(confirmation))}>Confirmer le remplacement</button>
            <button type="button" disabled={pending} className={secondaryButton}
              onClick={() => setConfirmation(undefined)}>Revenir au choix</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {remoteExists ? (
            <button type="button" disabled={pending} className={primaryButton}
              onClick={() => associationEmpty ? void run(() => associate('restore')) : setConfirmation('restore')}>
              {associationEmpty ? 'Récupérer mon budget' : 'Remplacer ce budget par celui de mon compte'}
            </button>
          ) : (
            <>
              <button type="button" disabled={pending} className={primaryButton}
                onClick={() => void run(() => associate('attach'))}>
                {associationEmpty ? 'Continuer avec ce compte' : 'Associer ce budget à mon compte'}
              </button>
              {!associationEmpty && <button type="button" disabled={pending} className={secondaryButton}
                onClick={() => setConfirmation('start-empty')}>Commencer avec un budget vide</button>}
            </>
          )}
          <button type="button" disabled={pending} onClick={() => void run(signOut)}
            className={secondaryButton}>Annuler</button>
        </div>
      )}
      <ErrorText message={error} />
      {error && <button type="button" disabled={pending} className={secondaryButton}
        onClick={() => void run(refreshAccount)}>Relancer le choix d’association</button>}
    </Card>
  );
}

function AccountProblem() {
  const { phase, account, error, signOut, refreshAccount } = useCloudSync();
  const action = useAction();
  return (
    <Card className="space-y-3 text-sm text-slate-700">
      <h2 className="font-semibold text-slate-900">Ce budget est protégé</h2>
      {phase === 'account-mismatch' && <p>Ce budget est associé à un autre compte. Déconnecte-toi puis reconnecte-toi à son compte.</p>}
      <ErrorText message={action.error || error} />
      {account && <button type="button" disabled={action.pending}
        onClick={() => void action.run(signOut)} className={secondaryButton}>Se déconnecter</button>}
      {phase === 'account-error' && <button type="button" disabled={action.pending}
        onClick={() => void action.run(refreshAccount)} className={secondaryButton}>Vérifier de nouveau</button>}
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

export function VaultProgress() {
  const { phase, initialVaultConfirmed, error, resumeVault, refreshAccount } = useCloudSync();
  const action = useAction();
  if (phase === 'local-only') return (
    <Card className="space-y-2 text-sm text-slate-700">
      <p role="status">Ton budget est disponible sur cet appareil. La synchronisation reprendra après vérification du compte.</p>
      <button type="button" disabled={action.pending} className={secondaryButton} onClick={() => void action.run(refreshAccount)}>Vérifier la connexion</button>
    </Card>
  );
  if (phase === 'vault-pending') return (
    <Card className="space-y-2 text-sm text-slate-700">
      <p role="status">Copie en ligne en attente de confirmation.</p>
      <ErrorText message={action.error || error} />
      <button type="button" disabled={action.pending} className={secondaryButton} onClick={() => void action.run(resumeVault)}>Réessayer</button>
    </Card>
  );
  if (initialVaultConfirmed) return <p role="status" className="px-4 py-2 text-sm font-medium text-teal-800">Copie en ligne créée.</p>;
  return null;
}

function Active() {
  const { phase, account, lastSyncedAt, conflictRemoteDate, error, initialVaultConfirmed,
    syncNow, resolveConflict, signOut, deleteAccount } = useCloudSync();
  const action = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      {phase === 'synced' && initialVaultConfirmed && <VaultProgress />}
      {phase === 'vault-pending' || phase === 'local-only' ? <VaultProgress /> : phase === 'conflict' ? (
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
        <p className="text-xs text-slate-600">Le budget reste sur ce téléphone. Reconnecte-toi au même compte pour y accéder.</p>
        {phase !== 'vault-pending' && phase !== 'local-only' && (!confirmDelete ? (
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
        ))}
      </Card>
    </>
  );
}

export default function CloudAccountSection({ protectedBudget = false, startingAccount = false }: {
  protectedBudget?: boolean;
  startingAccount?: boolean;
}) {
  const { phase, beginSignIn, signingUp, otpEmail } = useCloudSync();

  return (
    <>
      {phase === 'off' && (
        <Card className="flex items-start gap-3 text-sm text-slate-700">
          <Icon icon={CloudOff} className="size-5 shrink-0 text-slate-500" />
          <p>La synchronisation n’est pas disponible sur cette version. Ton budget reste enregistré sur cet appareil.</p>
        </Card>
      )}
      {phase === 'loading' && <p role="status" className="text-sm text-slate-600">Chargement…</p>}
      {!protectedBudget && phase !== 'off' && phase !== 'loading' && <Explanation />}
      {protectedBudget && !startingAccount && phase === 'signed-out' && (
        <p className="text-sm text-slate-700">Reconnecte-toi au compte de ce budget pour y accéder.</p>
      )}
      {phase === 'signed-out' && <SignIn />}
      {phase === 'signed-out' && accountSignupEnabled && (!protectedBudget || startingAccount) && !otpEmail && (
        <button type="button" className={secondaryButton} onClick={() => beginSignIn(!signingUp)}>
          {signingUp ? 'J’ai déjà un compte' : startingAccount ? 'Créer mon compte' : 'Créer un compte pour ce budget'}
        </button>
      )}
      {phase === 'needs-passphrase' && <Passphrase />}
      {phase === 'awaiting-association' && <AssociationChoice />}
      {(phase === 'account-error' || phase === 'account-mismatch') && <AccountProblem />}
      {!protectedBudget && (phase === 'syncing' || phase === 'synced' || phase === 'conflict' || phase === 'error'
        || phase === 'local-only' || phase === 'vault-pending') && <Active />}
    </>
  );
}
