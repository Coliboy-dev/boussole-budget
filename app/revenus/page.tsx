'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import Modal from '@/components/ui/Modal';
import IncomeForm from '@/components/forms/IncomeForm';
import IncomeList from '@/components/budget/IncomeList';
import Card from '@/components/ui/Card';
import AlertBanner from '@/components/ui/AlertBanner';
import { calculateTotalMonthlyIncome, formatCurrency } from '@/lib/budget-calculations';
import type { Income } from '@/lib/types';

export default function RevenusPage() {
  const { incomes, addIncome, updateIncome, deleteIncome } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Income | null>(null);

  const totalMonthly = calculateTotalMonthlyIncome(incomes);
  const confirmedTotal = calculateTotalMonthlyIncome(incomes.filter((i) => i.isConfirmed));
  const unconfirmedTotal = totalMonthly - confirmedTotal;

  function handleEdit(income: Income) {
    setEditItem(income);
    setShowForm(true);
  }

  function handleSubmit(data: Omit<Income, 'id'>) {
    if (editItem) {
      updateIncome(editItem.id, data);
    } else {
      addIncome(data);
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
          title={editItem ? 'Modifier le revenu' : 'Ajouter un revenu'}
          onClose={handleClose}
        >
          <IncomeForm initial={editItem ?? undefined} onSubmit={handleSubmit} onCancel={handleClose} />
        </Modal>
      )}

      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">💰 Mes revenus</h1>
            <p className="text-sm text-gray-500 mt-0.5">Tous tes revenus mensuels</p>
          </div>
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-teal-500 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-teal-600 transition-colors shadow-sm"
          >
            + Ajouter
          </button>
        </div>

        <Card className="bg-green-50 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-green-600 mb-1">
                Total mensuel
              </p>
              <p className="text-3xl font-bold text-green-700">{formatCurrency(totalMonthly)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-1">Dont confirmé</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(confirmedTotal)}</p>
            </div>
          </div>
          {unconfirmedTotal > 0 && (
            <p className="text-xs text-amber-600 mt-2 pt-2 border-t border-green-200">
              ⚠️ {formatCurrency(unconfirmedTotal)} de revenus incertains inclus
            </p>
          )}
        </Card>

        {unconfirmedTotal > 0 && (
          <AlertBanner variant="warning" title="Revenus incertains">
            Ton budget mensuel compte {formatCurrency(unconfirmedTotal)} de revenus incertains.
            Les revenus confirmés représentent {formatCurrency(confirmedTotal)} par mois.
          </AlertBanner>
        )}

        <IncomeList
          incomes={incomes}
          onEdit={handleEdit}
          onDelete={(id) => { if (confirm('Supprimer ce revenu ?')) deleteIncome(id); }}
        />

        {incomes.length === 0 && (
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="w-full border-2 border-dashed border-teal-200 rounded-2xl py-6 text-center text-teal-500 font-semibold hover:bg-teal-50 transition-colors"
          >
            + Ajouter ton premier revenu
          </button>
        )}
      </div>
    </>
  );
}
