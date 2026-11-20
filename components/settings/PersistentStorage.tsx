'use client';

import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';

type Status = 'checking' | 'available' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'failed';

const messages: Record<Status, string> = {
  checking: 'Vérification du navigateur…',
  available: '',
  requesting: 'Demande en cours…',
  granted: 'Le navigateur a activé le stockage persistant.',
  denied: 'Le navigateur a refusé le stockage persistant. Exporte une copie depuis Sauvegarde.',
  unsupported: 'Ce navigateur ne permet pas de demander le stockage persistant. Exporte une copie depuis Sauvegarde.',
  failed: 'La demande a échoué. Tu peux réessayer ou exporter une copie depuis Sauvegarde.',
};

async function readStatus(): Promise<Status> {
  try {
    const storage = navigator.storage;
    if (typeof storage?.persist !== 'function') return 'unsupported';
    return await storage.persisted?.() ? 'granted' : 'available';
  } catch {
    return 'available';
  }
}

export default function PersistentStorage() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let active = true;
    void readStatus().then((result) => {
      if (active) setStatus(result);
    });
    return () => { active = false; };
  }, []);

  const canRequest = status === 'available' || status === 'denied' || status === 'failed';

  async function requestProtection() {
    if (!canRequest) return;
    setStatus('requesting');
    try {
      setStatus(await navigator.storage.persist() ? 'granted' : 'denied');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <Card className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-900">Stockage persistant</h2>
      <p className="text-sm text-gray-700">Cette protection réduit le risque d’effacement automatique par le navigateur.</p>
      {status !== 'unsupported' && (
        <button
          type="button"
          aria-disabled={!canRequest}
          aria-describedby="persistent-storage-status"
          onClick={requestProtection}
          className="min-h-11 rounded-lg border border-teal-700 px-3 text-sm font-semibold text-teal-800 aria-disabled:opacity-60"
        >
          Demander le stockage persistant
        </button>
      )}
      <p id="persistent-storage-status" role="status" className="text-sm text-gray-700">{messages[status]}</p>
    </Card>
  );
}
