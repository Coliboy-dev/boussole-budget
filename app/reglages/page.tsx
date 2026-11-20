'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { isNonNegativeBudgetAmount } from '@/lib/budget-schema';
import { fromCents, toCents } from '@/lib/money';
import FormField from '@/components/forms/FormField';
import { useFormValidation } from '@/components/forms/useFormValidation';
import PersistentStorage from '@/components/settings/PersistentStorage';
import AlertBanner from '@/components/ui/AlertBanner';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';

export default function SettingsPage() {
  const { userProfile, isBudgetLoading, storageBlocked, saveProfileSettings, clearBudget } = useApp();
  const validation = useFormValidation();
  const [showErase, setShowErase] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [formRevision, setFormRevision] = useState(0);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');
    const data = new FormData(event.currentTarget);
    const firstName = String(data.get('firstName') ?? '').trim();
    const reserve = String(data.get('reserve') ?? '');
    const amount = Number(reserve);
    if (!validation.validate(event.currentTarget, {
      reserve: reserve !== '' && isNonNegativeBudgetAmount(amount) ? undefined : 'Saisis un montant valide et positif ou nul.',
    })) return;

    try {
      saveProfileSettings({ firstName, safetyReserve: fromCents(toCents(amount)) });
      setMessage('Réglages enregistrés.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Impossible d’enregistrer les réglages.');
    }
  }

  function erase() {
    setMessage('');
    setError('');
    try {
      clearBudget();
      validation.reset();
      setFormRevision((revision) => revision + 1);
      setMessage('Budget effacé de cet appareil.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Impossible d’effacer le budget.');
    } finally {
      setShowErase(false);
    }
  }

  if (isBudgetLoading) {
    return <p role="status" className="px-4 py-6 text-sm text-gray-600">Chargement du budget…</p>;
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-gray-900">Réglages</h1>
      {storageBlocked && (
        <AlertBanner variant="warning" title="Stockage indisponible">
          Les réglages ne peuvent pas être enregistrés actuellement.
        </AlertBanner>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-red-800">{error}</p>}
      <p role="status" className={message ? 'text-sm font-semibold text-teal-800' : 'sr-only'}>{message}</p>

      <Card>
        <form
          key={formRevision}
          className="space-y-4"
          onSubmit={save}
          onChange={validation.clearFieldError}
          noValidate
        >
          <FormField label="Prénom" error={validation.errors.firstName}>
            <input name="firstName" autoComplete="given-name" maxLength={80} defaultValue={userProfile.firstName}
              className="min-h-11 w-full rounded-lg border border-gray-400 px-3 py-2 text-sm" />
          </FormField>
          <div id="reserve" tabIndex={-1} className="scroll-mt-4">
            <FormField label="Réserve de sécurité (€)" required error={validation.errors.reserve}>
              <input name="reserve" type="number" min="0" step="0.01" required defaultValue={userProfile.safetyReserve}
                className="min-h-11 w-full rounded-lg border border-gray-400 px-3 py-2 text-sm" />
            </FormField>
          </div>
          <button type="submit" disabled={storageBlocked}
            className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
            Enregistrer les réglages
          </button>
        </form>
      </Card>

      <PersistentStorage />

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Données du budget</h2>
        <div className="flex flex-col items-start">
          <Link href="/demo" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline">
            Ouvrir le budget de démonstration
          </Link>
          <Link href="/sauvegarde" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline">
            Sauvegarder ou restaurer
          </Link>
          <button type="button" onClick={() => setShowErase(true)} className="min-h-11 text-sm font-semibold text-red-800 underline">
            Effacer le budget de cet appareil
          </button>
        </div>
      </Card>

      {showErase && (
        <Modal title="Effacer le budget ?" onClose={() => setShowErase(false)}>
          <p className="text-sm text-gray-700">
            Le solde, les opérations et les réglages enregistrés sur cet appareil seront effacés.
            Pour garder une copie, télécharge d’abord une sauvegarde.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setShowErase(false)} className="min-h-11 rounded-lg px-4 text-sm font-semibold text-gray-800">
              Annuler
            </button>
            <button type="button" onClick={erase} className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white">
              Effacer le budget
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
