'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import BrandLogo from '@/components/ui/BrandLogo';
import { Icon } from '@/components/ui/icons';
import { PIN_LENGTH, VEIL_CLASS } from '@/lib/app-lock';
import { managedBackupsEnabled } from '@/lib/cloud-remote';
import { deviceAuthenticatorAvailable } from '@/lib/webauthn-lock';
import { useLock } from './LockProvider';

const fieldClass = 'w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-center text-2xl tracking-[0.5em] tabular-nums';
const primaryButton = 'min-h-11 w-full rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:bg-gray-400';
const textButton = 'min-h-11 w-full text-sm font-semibold text-teal-800 underline disabled:opacity-50';
const CONFIRM_WORD = 'EFFACER';

function hasAccount(): boolean {
  try {
    return localStorage.getItem('boussole-sync-v1') !== null || localStorage.getItem('boussole-auth') !== null;
  } catch {
    return false;
  }
}

function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s` : `${seconds} s`;
}

export default function LockScreen({ allowAutomaticUnlock }: { allowAutomaticUnlock: boolean }) {
  const { unlock, unlockWithDevice, cancelDeviceUnlock, retryAt, unreadable, deviceStatus, devicePending } = useLock();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [method, setMethod] = useState<'phone' | 'unconfirmed' | 'pin'>('phone');
  const [deviceAvailable, setDeviceAvailable] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const requestedPhone = useRef(false);
  const errorId = useId();
  const waiting = retryAt > now;
  const canUsePhone = deviceStatus === 'valid' && deviceAvailable === true;
  const showPin = deviceStatus !== 'valid' || deviceAvailable === false || method !== 'phone';

  // L’écran est rendu : le voile peut être retiré sans dévoiler le budget.
  useLayoutEffect(() => {
    document.documentElement.classList.remove(VEIL_CLASS);
  }, []);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  useEffect(() => {
    let cancelled = false;
    void deviceAuthenticatorAvailable().then((available) => {
      if (!cancelled) setDeviceAvailable(available);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (showPin && !forgot && !waiting) inputRef.current?.focus();
  }, [showPin, forgot, waiting]);

  const requestPhone = useCallback(async () => {
    const ok = await unlockWithDevice();
    if (!ok && document.visibilityState === 'visible') {
      setMethod((current) => current === 'pin' ? current : 'unconfirmed');
    }
  }, [unlockWithDevice]);

  useEffect(() => {
    if (!allowAutomaticUnlock || !canUsePhone || devicePending || requestedPhone.current
      || method !== 'phone' || document.visibilityState !== 'visible') return;
    requestedPhone.current = true;
    void requestPhone();
  }, [allowAutomaticUnlock, canUsePhone, devicePending, method, requestPhone]);

  function choosePin() {
    requestedPhone.current = true;
    setMethod('pin');
    cancelDeviceUnlock();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (waiting || pending) return;
    if (devicePending) choosePin();
    setPending(true);
    setError('');
    const ok = await unlock(pin);
    setPending(false);
    if (!ok) {
      setPin('');
      setNow(Date.now());
      setError('Code incorrect.');
      inputRef.current?.focus();
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <div className="flex items-center justify-center">
        <BrandLogo height={40} priority />
      </div>
      {unreadable && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Le réglage du verrou est illisible sur ce téléphone. Pour protéger ton budget, Capiste reste verrouillé :
          la seule issue est d’effacer Capiste sur ce téléphone, puis de récupérer ton budget depuis ta copie en ligne ou une sauvegarde.
        </div>
      )}
      {forgot || unreadable ? <ForgotPin onCancel={unreadable ? undefined : () => setForgot(false)} /> : (
        <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl border border-line bg-white p-5">
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Icon icon={LockKeyhole} className="size-5 text-teal-700" />
            Capiste est verrouillé
          </h1>
          {canUsePhone && (
            <button type="button" disabled={devicePending || pending} aria-busy={devicePending}
              onClick={() => {
                requestedPhone.current = true;
                if (showPin) setMethod('unconfirmed');
                void requestPhone();
              }}
              className={showPin ? textButton : primaryButton}>
              Se déverrouiller
            </button>
          )}
          {!showPin && <button type="button" className={textButton} onClick={choosePin}>Utiliser mon code Capiste</button>}
          {deviceStatus === 'valid' && deviceAvailable === false && (
            <p className="text-sm text-slate-700">
              Le déverrouillage par le téléphone n&apos;est pas disponible dans ce navigateur. Utilise ton code Capiste.
            </p>
          )}
          {deviceStatus === 'invalid' && (
            <p className="text-sm text-amber-900">La méthode du téléphone doit être réactivée dans Compte et sécurité. Ton code Capiste reste valable.</p>
          )}
          {showPin && (
            <>
              {canUsePhone && method === 'unconfirmed' && !devicePending && (
                <p role="alert" className="text-sm text-amber-900">Le téléphone n&apos;a pas confirmé. Entre ton code Capiste.</p>
              )}
              <div>
                <label htmlFor="lock-pin" className="mb-1.5 block text-sm font-semibold text-slate-700">Ton code à {PIN_LENGTH} chiffres</label>
                <input
                  id="lock-pin" ref={inputRef} name="pin" type="password" inputMode="numeric" autoComplete="off"
                  maxLength={PIN_LENGTH} value={pin} disabled={waiting}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                  aria-invalid={error ? true : undefined} aria-describedby={error || waiting ? errorId : undefined}
                  className={fieldClass}
                />
                {(error || waiting) && (
                  <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">
                    {waiting ? `Trop d’essais. Réessaie dans ${formatWait(retryAt - now)}.` : error}
                  </p>
                )}
              </div>
              <button type="submit" disabled={waiting || pending || pin.length !== PIN_LENGTH} className={primaryButton}>
                {pending ? 'Vérification…' : 'Déverrouiller'}
              </button>
              <button type="button" onClick={() => { choosePin(); setForgot(true); }} className={textButton}>
                Code oublié ?
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}

function ForgotPin({ onCancel }: { onCancel?: () => void }) {
  const { eraseEverything } = useLock();
  const [word, setWord] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const account = hasAccount();

  useEffect(() => {
    heading.current?.focus();
  }, []);

  async function erase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (word.trim().toUpperCase() !== CONFIRM_WORD) return;
    setPending(true);
    setFailure('');
    const result = await eraseEverything();
    if (result.ok) {
      window.location.replace('/');
      return;
    }
    setPending(false);
    setFailure('L’effacement n’est pas complet. Ferme les autres onglets de Capiste puis réessaie.');
  }

  return (
    <form onSubmit={erase} noValidate className="space-y-4 rounded-2xl border border-red-200 bg-white p-5 text-sm text-slate-700">
      <h1 ref={heading} tabIndex={-1} className="text-lg font-bold text-slate-900 focus:outline-none">
        {onCancel ? 'Code oublié' : 'Effacer Capiste sur ce téléphone'}
      </h1>
      <p>Sans le code, la seule issue est d’effacer Capiste sur ce téléphone : budget, réglages et verrou.</p>
      {account ? (
        <p>
          {managedBackupsEnabled
            ? 'Après l’effacement, reconnecte-toi par e-mail pour récupérer ta copie en ligne. Une ancienne copie peut encore demander sa phrase secrète.'
            : 'Tu as un compte : après l’effacement, reconnecte-toi avec ton e-mail et ta phrase secrète pour récupérer ta copie en ligne.'}{' '}
          Les modifications faites sur ce téléphone et pas encore synchronisées seront perdues.
        </p>
      ) : (
        <p>
          Ton budget sera supprimé de ce téléphone. Si tu as un fichier de sauvegarde, tu pourras le restaurer ensuite.
        </p>
      )}
      <p className="text-xs text-slate-600">
        Une personne qui tient ton téléphone peut aussi supprimer Capiste depuis les réglages du téléphone. Le verrou protège tes informations, pas leur conservation.
      </p>
      <div>
        <label htmlFor="erase-confirm" className="mb-1.5 block font-semibold text-slate-800">
          Pour confirmer, écris {CONFIRM_WORD}
        </label>
        <input id="erase-confirm" name="confirm" autoComplete="off" autoCapitalize="characters" value={word}
          onChange={(event) => setWord(event.target.value)}
          className="w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-base" />
      </div>
      {failure && <p role="alert" className="text-red-700">{failure}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || word.trim().toUpperCase() !== CONFIRM_WORD}
          className="min-h-11 rounded-xl bg-red-700 px-4 font-semibold text-white hover:bg-red-800 disabled:bg-gray-400">
          {pending ? 'Effacement…' : 'Effacer Capiste sur ce téléphone'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-slate-300 px-4 font-semibold text-slate-800">
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
