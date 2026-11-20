'use client';

import Link from 'next/link';
import { useState } from 'react';
import { frequencyLabels } from '@/components/budget/ExpenseList';
import MediationForm from '@/components/forms/MediationForm';
import AlertBanner from '@/components/ui/AlertBanner';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { formatCurrency, formatDate } from '@/lib/budget-calculations';
import { useApp } from '@/lib/context/AppContext';
import type { MediationFile } from '@/lib/types';
import './summary.css';

const procedureLabels = {
  amicable: 'Médiation de dettes amiable',
  collective: 'Règlement collectif de dettes',
};

export default function MediationPage() {
  const { incomes, mediationFile, today, isBudgetLoading, storageBlocked, balanceDate, updateMediation } = useApp();
  const [editing, setEditing] = useState(false);

  if (isBudgetLoading) {
    return <p role="status" className="px-4 py-6 text-sm text-gray-600">Chargement du suivi…</p>;
  }

  const { procedure, allowanceIncomeId, mediatorOrganization, nextAppointment, proposedPlan, questionsForMediator } = mediationFile;
  const allowance = incomes.find(({ id }) => id === allowanceIncomeId);
  const hasSummary = Boolean(procedure || allowance || mediatorOrganization || nextAppointment || proposedPlan || questionsForMediator.length);

  function save(data: Partial<MediationFile>) {
    updateMediation(data);
    setEditing(false);
  }

  return (
    <div data-mediation-summary className="space-y-4 px-4 py-4 print:p-0">
      <header className="space-y-2">
        <p className="text-xs font-semibold text-teal-800 print:text-black">Brouillon pour les entretiens</p>
        <h1 className="text-xl font-bold text-gray-900">Suivi de médiation</h1>
        <p className="text-sm text-gray-700">Synthèse pour préparer ton rendez-vous.</p>
        <p className="text-sm text-gray-700">Préparée le <time dateTime={today}>{formatDate(today)}</time>.</p>
      </header>

      <div className="space-y-3 print:hidden">
        {storageBlocked && (
          <AlertBanner variant="warning" title="Stockage indisponible">
            Les modifications ne peuvent pas être enregistrées actuellement.
          </AlertBanner>
        )}
        {!balanceDate && (
          <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline">
            Enregistrer ton solde dans Aujourd’hui pour modifier le suivi
          </Link>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={storageBlocked || !balanceDate} onClick={() => setEditing(true)}
            className="min-h-11 rounded-xl bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
            Modifier le suivi
          </button>
          {hasSummary && (
            <button type="button" onClick={() => window.print()}
              className="min-h-11 rounded-xl border border-teal-700 bg-white px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50">
              Imprimer la synthèse
            </button>
          )}
        </div>
        {editing && (
          <Modal title="Modifier le suivi" onClose={() => setEditing(false)}>
            <MediationForm
              initial={mediationFile}
              incomes={incomes}
              onSave={save}
              onCancel={() => setEditing(false)}
            />
          </Modal>
        )}
      </div>

      <Card className="space-y-2 print:break-inside-avoid">
        <h2 className="text-sm font-semibold text-gray-900">Rendez-vous</h2>
        {procedure && <p className="text-sm text-gray-800">{procedureLabels[procedure]}</p>}
        {mediatorOrganization && <p className="wrap-anywhere text-sm text-gray-800">{mediatorOrganization}</p>}
        <p className="text-sm text-gray-700">
          {nextAppointment ? <time dateTime={nextAppointment}>{formatDate(nextAppointment)}</time> : 'Date à préciser'}
        </p>
      </Card>

      <Card className="space-y-2 print:break-inside-avoid">
        <h2 className="text-sm font-semibold text-gray-900">Pécule</h2>
        {allowance ? (
          <>
            <p className="wrap-anywhere text-sm text-gray-800">{allowance.label}</p>
            <p className="text-sm text-gray-700">
              <strong className="font-semibold text-gray-900">{formatCurrency(allowance.amount)}</strong>
              {' · '}{frequencyLabels[allowance.frequency]}
            </p>
            <p className="text-xs text-gray-700">{allowance.isConfirmed ? 'Rentrée certaine' : 'Rentrée incertaine'}</p>
          </>
        ) : (
          <p className="text-sm text-gray-700">
            {allowanceIncomeId ? 'La rentrée associée est indisponible.' : 'Aucune rentrée associée.'}
          </p>
        )}
        <Link href="/revenus" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline print:hidden">
          Ouvrir les revenus
        </Link>
      </Card>

      <Card className="space-y-2 print:break-inside-avoid">
        <h2 className="text-sm font-semibold text-gray-900">Plan communiqué</h2>
        {proposedPlan ? (
          <dl className="grid grid-cols-3 gap-2">
            <div className="min-w-0">
              <dt className="text-xs text-gray-600">Montant total</dt>
              <dd className="wrap-anywhere font-semibold tabular-nums">{formatCurrency(proposedPlan.totalAmount)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-gray-600">Versement mensuel</dt>
              <dd className="wrap-anywhere font-semibold tabular-nums">{formatCurrency(proposedPlan.monthlyPayment)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-gray-600">Durée</dt>
              <dd className="wrap-anywhere font-semibold tabular-nums">{proposedPlan.duration} mois</dd>
            </div>
          </dl>
        ) : <p className="text-sm text-gray-700">Aucun plan renseigné.</p>}
      </Card>

      {questionsForMediator.length > 0 && (
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Questions pour le rendez-vous</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            {questionsForMediator.map((question, index) => (
              <li key={index} className="wrap-anywhere print:break-inside-avoid">{question}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
