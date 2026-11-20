'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import { deserializeBudget, type AppState } from '@/lib/budget-state';
import { useApp } from '@/lib/context/AppContext';

interface SelectedBackup {
  name: string;
  budget: AppState;
}

export default function SauvegardePage() {
  const { canExportBudget, isBudgetLoading, storageBlocked, exportBudget, restoreBudget, today } = useApp();
  const [selection, setSelection] = useState<SelectedBackup | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function downloadBackup() {
    setError('');
    setNotice('');

    try {
      const contents = exportBudget();
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `boussole-budget-${today}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Impossible d’exporter le budget.');
    }
  }

  async function selectBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    setReading(true);
    setSelection(null);
    setError('');
    setNotice('');

    try {
      const contents = await file.text();
      setSelection({ name: file.name, budget: deserializeBudget(contents) });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Impossible de lire ce fichier.');
    } finally {
      setReading(false);
    }
  }

  function confirmRestore() {
    if (!selection) return;
    setError('');
    setNotice('');

    try {
      restoreBudget(selection.budget);
      setSelection(null);
      setNotice('Budget restauré et enregistré dans ce navigateur.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Impossible de restaurer le budget.');
    }
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-gray-800">Sauvegarde du budget</h1>

      {storageBlocked && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Le stockage du navigateur est indisponible ou le budget enregistré est illisible.
        </p>
      )}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">Exporter</h2>
        <p className="text-sm text-gray-600">Télécharge une copie JSON de tes données financières.</p>
        <button
          type="button"
          disabled={!canExportBudget}
          onClick={downloadBackup}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Télécharger le budget
        </button>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">Restaurer</h2>
        <label className="block text-sm font-medium text-gray-800">
          Choisir un fichier JSON
          <input
            type="file"
            accept=".json,application/json"
            onChange={selectBackup}
            disabled={isBudgetLoading || reading}
            className="mt-2 block w-full text-sm text-gray-600 file:mr-2 file:min-h-11 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:font-medium file:text-teal-800 disabled:opacity-50"
          />
        </label>
        {reading && <p role="status" className="text-sm text-gray-600">Vérification du fichier…</p>}
        {selection && (
          <div className="space-y-2 rounded-xl bg-gray-50 p-3">
            <p className="wrap-break-word text-sm font-medium text-gray-800">{selection.name}</p>
            <p className="text-sm text-gray-700">
              La restauration remplace le budget de ce navigateur. Tu peux d’abord télécharger le budget actuel pour en garder une copie.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={confirmRestore}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white"
              >
                Restaurer ce budget
              </button>
              <button
                type="button"
                onClick={() => { setSelection(null); setError(''); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </Card>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{notice}</p>}
    </div>
  );
}
