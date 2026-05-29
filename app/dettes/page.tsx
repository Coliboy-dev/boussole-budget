'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import Modal from '@/components/ui/Modal';
import DebtForm from '@/components/forms/DebtForm';
import DebtList from '@/components/debts/DebtList';
import Card from '@/components/ui/Card';
import AlertBanner from '@/components/ui/AlertBanner';
import { calculateTotalMonthlyDebts, formatCurrency } from '@/lib/budget-calculations';
import type { Debt } from '@/lib/types';

export default function DettesPage() {
  const { debts, addDebt, updateDebt, deleteDebt } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Debt | null>(null);

  const totalRemaining = debts.reduce((s, d) => s + d.remainingAmount, 0);
  const totalMonthly = calculateTotalMonthlyDebts(debts);
  const lateDebts = debts.filter((d) => d.status === 'late');
  const mediationDebts = debts.filter((d) => d.status === 'in_mediation');
  const totalInitial = debts.reduce((s, d) => s + d.initialAmount, 0);
  const repaidPercent =
    totalInitial > 0 ? Math.round(((totalInitial - totalRemaining) / totalInitial) * 100) : 0;

  function handleEdit(debt: Debt) {
    setEditItem(debt);
    setShowForm(true);
  }

  function handleSubmit(data: Omit<Debt, 'id'>) {
    if (editItem) {
      updateDebt(editItem.id, data);
    } else {
      addDebt(data);
    }
    setShowForm(false);
    setEditItem(null);
  }

  function handleClose() {
    setShowForm(false);
    setEditItem(null);
  }

  return (
    <>
      {showForm && (
        <Modal
          title={editItem ? 'Modifier la dette' : 'Ajouter une dette'}
          onClose={handleClose}
        >
          <DebtForm initial={editItem ?? undefined} onSubmit={handleSubmit} onCancel={handleClose} />
        </Modal>
      )}

      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">💳 Mes dettes</h1>
            <p className="text-sm text-gray-500 mt-0.5">Suivi de tes remboursements</p>
          </div>
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-teal-500 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-teal-600 transition-colors shadow-sm"
          >
            + Ajouter
          </button>
        </div>

        {lateDebts.length > 0 && (
          <AlertBanner variant="danger" title="Dettes en retard">
            {lateDebts.length === 1
              ? 'Une dette est en retard de paiement.'
              : `${lateDebts.length} dettes sont en retard.`}{' '}
            Contacte ton médiateur avant d&apos;agir seul(e).
          </AlertBanner>
        )}

        <Card className="bg-amber-50 border-amber-200">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-gray-500 mb-1">Total restant</p>
              <p className="text-lg font-bold text-amber-700">{formatCurrency(totalRemaining)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Mensualités</p>
              <p className="text-lg font-bold text-amber-700">{formatCurrency(totalMonthly)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Remboursé</p>
              <p className="text-lg font-bold text-green-600">{repaidPercent}%</p>
            </div>
          </div>
          <div className="mt-3 flex gap-3 text-xs text-center">
            <div className="flex-1 bg-indigo-100 rounded-lg py-1.5">
              <span className="font-semibold text-indigo-700">{mediationDebts.length}</span>
              <p className="text-indigo-600">en médiation</p>
            </div>
            <div className="flex-1 bg-red-100 rounded-lg py-1.5">
              <span className="font-semibold text-red-700">{lateDebts.length}</span>
              <p className="text-red-600">en retard</p>
            </div>
            <div className="flex-1 bg-gray-100 rounded-lg py-1.5">
              <span className="font-semibold text-gray-700">{debts.length}</span>
              <p className="text-gray-500">total</p>
            </div>
          </div>
        </Card>

        <DebtList debts={debts} onEdit={handleEdit} onDelete={(id) => { if (confirm('Supprimer cette dette ?')) deleteDebt(id); }} />

        {debts.length === 0 && (
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="w-full border-2 border-dashed border-teal-200 rounded-2xl py-6 text-center text-teal-500 font-semibold hover:bg-teal-50 transition-colors"
          >
            + Ajouter ta première dette
          </button>
        )}
      </div>
    </>
  );
}
