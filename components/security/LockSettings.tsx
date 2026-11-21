'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import Card from '@/components/ui/Card';
import { Icon } from '@/components/ui/icons';
import { useCloudSync } from '@/components/sync/CloudSyncProvider';
import { LOCK_DELAYS, PIN_LENGTH, isValidPin, type LockDelay } from '@/lib/app-lock';
import { useLock } from './LockProvider';
import { deviceAuthenticatorAvailable } from '@/lib/webauthn-lock';

const fieldClass = 'w-full rounded-xl border border-gray-400 bg-white px-3 py-2 text-base tabular-nums';
const primaryButton = 'min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:bg-gray-400';
const secondaryButton = 'min-h-11 rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50';

const delayLabels: Record<LockDelay, string> = {
  0: 'Immédiatement',
  60_000: 'Après 1 minute',
  300_000: 'Après 5 minutes',
};

type Mode = 'idle' | 'enable' | 'change' | 'disable';

function PinField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      <input id={id} name={id} type="password" inputMode="numeric" autoComplete="off" maxLength={PIN_LENGTH}
        value={value} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
        className={fieldClass} />
    </div>
  );
}

function DelaySelect({ value, onChange }: { value: LockDelay; onChange: (delay: LockDelay) => void }) {
  return (
    <div>
      <label htmlFor="lock-delay" className="mb-1.5 block text-sm font-semibold text-slate-700">Verrouiller en quittant Boussole</label>
      <select id="lock-delay" value={value} onChange={(event) => onChange(Number(event.target.value) as LockDelay)} className={fieldClass}>
        {LOCK_DELAYS.map((delay) => <option key={delay} value={delay}>{delayLabels[delay]}</option>)}
      </select>
    </div>
  );
}

export default function LockSettings() {
  const lock = useLock();
  const { phase } = useCloudSync();
  const [mode, setMode] = useState<Mode>('idle');
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [delay, setDelay] = useState<LockDelay>(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [deviceAvailable, setDeviceAvailable] = useState<boolean | null>(null);
  const [deviceMode, setDeviceMode] = useState<'idle' | 'authorize' | 'ready' | 'remove'>('idle');
  const [devicePin, setDevicePin] = useState('');
  const [devicePending, setDevicePending] = useState(false);
  const [deviceError, setDeviceError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void deviceAuthenticatorAvailable().then((available) => {
      if (!cancelled) setDeviceAvailable(available);
    });
    return () => { cancelled = true; };
  }, []);

  async function authorizePhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDevicePending(true);
    setDeviceError('');
    try {
      if (deviceMode === 'remove') {
        const ok = await lock.removeDevice(devicePin);
        if (!ok) {
          setDeviceError('Code incorrect ou méthode impossible à désactiver.');
          return;
        }
        setDeviceMode('idle');
        setDevicePin('');
        setNotice('Déverrouillage avec le téléphone désactivé.');
        return;
      }
      const ok = await lock.authorizeDeviceEnrollment(devicePin);
      if (!ok) {
        setDeviceError('Code Boussole incorrect. Réessaie.');
        return;
      }
      setDevicePin('');
      setDeviceMode('ready');
    } finally {
      setDevicePending(false);
    }
  }

  async function activatePhone() {
    setDevicePending(true);
    setDeviceError('');
    try {
      const ok = await lock.enrollDevice();
      if (!ok) {
        setDeviceError('Activation annulée ou incompatible avec ce téléphone. Ton code Boussole reste valable.');
        setDeviceMode('idle');
        return;
      }
      setDeviceMode('idle');
      setNotice('Déverrouillage avec le téléphone activé.');
    } finally {
      setDevicePending(false);
    }
  }
  const hasAccount = phase === 'syncing' || phase === 'synced' || phase === 'conflict' || phase === 'error';

  function reset(next: Mode) {
    setMode(next);
    setCurrent('');
    setPin('');
    setConfirmation('');
    setError('');
    setNotice('');
  }

  function newPinProblem(): string {
    if (!isValidPin(pin)) return `Le code doit contenir ${PIN_LENGTH} chiffres.`;
    if (pin !== confirmation) return 'Les deux codes ne correspondent pas.';
    return '';
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const problem = mode === 'disable' ? '' : newPinProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    try {
      if (mode === 'enable') {
        await lock.enable(pin, delay);
        reset('idle');
        return;
      }
      if (lock.retryAt > Date.now()) {
        setError('Trop d’essais. Réessaie dans quelques instants.');
        return;
      }
      const ok = mode === 'change' ? await lock.changePin(current, pin) : await lock.disable(current);
      if (!ok) {
        setError('Code actuel incorrect.');
        setCurrent('');
        return;
      }
      reset('idle');
      setNotice(mode === 'change' ? 'Le code a été changé.' : 'Le verrouillage est désactivé.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 id="verrouillage" className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Icon icon={LockKeyhole} className="size-5 text-teal-700" />
        Verrouillage
      </h2>
      <p className="text-sm text-slate-700">
        Le verrou empêche une personne qui a ton téléphone en main de voir tes finances dans Boussole.
        Il ne chiffre pas les données enregistrées sur ce téléphone et ne remplace pas le code de ton téléphone.
      </p>
      <p className="text-sm text-slate-700">
        Sur iPhone, l’aperçu du sélecteur d’applications montre ce qui était à l’écran quand tu as quitté Boussole, montants compris. Pour l’éviter, appuie sur le cadenas avant de quitter Boussole.
      </p>
      {notice && <p role="status" className="text-sm font-medium text-green-800">{notice}</p>}

      {mode === 'idle' && !lock.enabled && (
        <button type="button" className={primaryButton} onClick={() => reset('enable')}>Activer le verrouillage</button>
      )}

      {mode === 'idle' && lock.enabled && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-900">Le verrouillage est actif.</p>
          <DelaySelect value={lock.delay} onChange={(next) => { lock.setDelay(next); setNotice('Délai enregistré.'); }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButton} onClick={lock.lockNow}>Verrouiller maintenant</button>
            <button type="button" className={secondaryButton} onClick={() => reset('change')}>Changer le code</button>
            <button type="button" className="min-h-11 rounded-xl px-4 text-sm font-semibold text-red-800 underline" onClick={() => reset('disable')}>
              Désactiver
            </button>
          </div>
          <div className="space-y-3 border-t border-slate-200 pt-3">
            <h3 className="text-sm font-semibold text-slate-900">Déverrouillage avec le téléphone</h3>
            <p className="text-sm text-slate-700">Face ID, empreinte ou code du téléphone, selon l’appareil. L’option est facultative.</p>
            {lock.deviceStatus === 'invalid' && (
              <p role="status" className="text-sm text-amber-900">
                Cette méthode est devenue inutilisable. Tu peux la réactiver ; ton code Boussole fonctionne toujours.
              </p>
            )}
            {lock.deviceStatus === 'valid' && <p role="status" className="text-sm text-green-800">Méthode du téléphone activée.</p>}
            {deviceMode === 'idle' && deviceError && (
              <p role="alert" className="text-sm text-red-700">{deviceError}</p>
            )}
            {deviceMode === 'idle' && lock.deviceStatus === 'valid' && (
              <button type="button" className={secondaryButton}
                onClick={() => { setDeviceMode('remove'); setDevicePin(''); setDeviceError(''); }}>
                Désactiver le déverrouillage par le téléphone
              </button>
            )}
            {deviceMode === 'idle' && lock.deviceStatus !== 'valid' && deviceAvailable === true && (
              <button type="button" className={secondaryButton}
                onClick={() => { setDeviceMode('authorize'); setDevicePin(''); setDeviceError(''); }}>
                Activer le déverrouillage avec le téléphone
              </button>
            )}
            {deviceMode === 'idle' && lock.deviceStatus !== 'valid' && deviceAvailable === false && (
              <p className="text-sm text-slate-600">Méthode indisponible dans ce navigateur. Le code Boussole reste disponible.</p>
            )}
            {deviceMode === 'authorize' && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
                Toute personne qui connaît le code de déverrouillage de ce téléphone pourrait aussi ouvrir Boussole.
                Ton code Boussole restera nécessaire si le téléphone refuse.
              </p>
            )}
            {(deviceMode === 'authorize' || deviceMode === 'remove') && (
              <form onSubmit={(event) => void authorizePhone(event)} className="space-y-2">
                <PinField id="phone-pin" label="Confirme ton code Boussole actuel" value={devicePin} onChange={setDevicePin} />
                {deviceError && <p role="alert" className="text-sm text-red-700">{deviceError}</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className={primaryButton} disabled={devicePending || devicePin.length !== PIN_LENGTH}>
                    {devicePending ? 'Vérification…' : deviceMode === 'remove' ? 'Désactiver' : 'Confirmer le code'}
                  </button>
                  <button type="button" className={secondaryButton} onClick={() => { setDeviceMode('idle'); setDevicePin(''); }}>Annuler</button>
                </div>
              </form>
            )}
            {deviceMode === 'ready' && (
              <div className="space-y-2">
                <p className="text-sm text-slate-700">Confirme maintenant sur ton téléphone pour terminer l’activation.</p>
                {deviceError && <p role="alert" className="text-sm text-red-700">{deviceError}</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={devicePending} onClick={() => void activatePhone()} className={primaryButton}>
                    {devicePending ? 'Vérification sur le téléphone…' : 'Continuer sur mon téléphone'}
                  </button>
                  <button type="button" onClick={() => setDeviceMode('idle')} className={secondaryButton}>Annuler</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {mode !== 'idle' && (
        <form onSubmit={submit} noValidate className="space-y-3">
          {mode !== 'enable' && <PinField id="lock-current" label="Code actuel" value={current} onChange={setCurrent} />}
          {mode !== 'disable' && (
            <>
              <PinField id="lock-new" label={`Nouveau code à ${PIN_LENGTH} chiffres`} value={pin} onChange={setPin} />
              <PinField id="lock-confirm" label="Confirme le code" value={confirmation} onChange={setConfirmation} />
            </>
          )}
          {mode === 'enable' && <DelaySelect value={delay} onChange={setDelay} />}
          {mode === 'enable' && !hasAccount && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Sans compte, un code oublié oblige à effacer le budget de ce téléphone. Garde une sauvegarde ou crée un compte.
            </p>
          )}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={primaryButton}>
              {mode === 'enable' ? 'Activer' : mode === 'change' ? 'Changer le code' : 'Désactiver le verrouillage'}
            </button>
            <button type="button" className={secondaryButton} onClick={() => reset('idle')}>Annuler</button>
          </div>
        </form>
      )}
    </Card>
  );
}
