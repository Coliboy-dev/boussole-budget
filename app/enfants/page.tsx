'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import Modal from '@/components/ui/Modal';
import ChildExpenseForm from '@/components/forms/ChildExpenseForm';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';
import type { ChildExpense, ChildExpenseStatus, ChildExpenseCategory } from '@/lib/types';

const statusConfig: Record<
  ChildExpenseStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' }
> = {
  paid: { label: 'Payé', variant: 'neutral' },
  pending: { label: 'En attente remboursement', variant: 'warning' },
  reimbursed: { label: 'Remboursé', variant: 'success' },
  receipt_sent: { label: 'Justificatif envoyé', variant: 'info' },
};

const categoryConfig: Record<ChildExpenseCategory, { label: string; icon: string }> = {
  school: { label: 'Scolarité', icon: '📚' },
  clothing: { label: 'Vêtements', icon: '👕' },
  activities: { label: 'Activités', icon: '⚽' },
  health: { label: 'Santé', icon: '💊' },
  transport: { label: 'Transport', icon: '🚌' },
  other: { label: 'Autre', icon: '📦' },
};

export default function EnfantsPage() {
  const { childExpenses, addChildExpense, updateChildExpense, deleteChildExpense } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ChildExpense | null>(null);

  const total = childExpenses.reduce((s, e) => s + e.paidByUser, 0);
  const pendingReimbursement = childExpenses
    .filter((e) => e.status === 'pending' || e.status === 'receipt_sent')
    .reduce((s, e) => s + e.shareAmount, 0);

  const byChild: Record<string, ChildExpense[]> = {};
  childExpenses.forEach((expense) => {
    const name = expense.childName || 'Non précisé';
    if (!byChild[name]) byChild[name] = [];
    byChild[name].push(expense);
  });

  function handleEdit(expense: ChildExpense) {
    setEditItem(expense);
    setShowForm(true);
  }

  function handleSubmit(data: Omit<ChildExpense, 'id'>) {
    if (editItem) {
      updateChildExpense(editItem.id, data);
    } else {
      addChildExpense(data);
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
          title={editItem ? 'Modifier le frais' : 'Ajouter un frais enfant'}
          onClose={handleClose}
        >
          <ChildExpenseForm
            initial={editItem ?? undefined}
            onSubmit={handleSubmit}
            onCancel={handleClose}
          />
        </Modal>
      )}

      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">👨‍👧‍👦 Frais enfants</h1>
            <p className="text-sm text-gray-500 mt-0.5">Dépenses pour tes enfants</p>
          </div>
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-teal-500 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-teal-600 transition-colors shadow-sm"
          >
            + Ajouter
          </button>
        </div>

        <Card className="bg-purple-50 border-purple-200">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Total avancé</p>
              <p className="text-xl font-bold text-purple-700">{formatCurrency(total)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">À rembourser</p>
              <p className="text-xl font-bold text-amber-600">{formatCurrency(pendingReimbursement)}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3 pt-2 border-t border-purple-100">
            💡 N&apos;oublie pas d&apos;envoyer les justificatifs pour te faire rembourser.
          </p>
        </Card>

        {Object.entries(byChild).map(([childName, expenses]) => {
          const childTotal = expenses.reduce((s, e) => s + e.paidByUser, 0);
          return (
            <div key={childName}>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-sm font-semibold text-gray-700">👤 {childName}</h2>
                <span className="text-sm font-bold text-gray-600">{formatCurrency(childTotal)}</span>
              </div>
              <div className="space-y-2">
                {expenses.map((expense) => {
                  const catConfig = categoryConfig[expense.category] || categoryConfig.other;
                  const status = statusConfig[expense.status];
                  return (
                    <Card key={expense.id}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-xl flex-shrink-0">
                          {catConfig.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-800">{expense.label}</p>
                            <p className="text-sm font-bold text-gray-800 flex-shrink-0">
                              {formatCurrency(expense.paidByUser)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="neutral">{catConfig.label}</Badge>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </div>
                          <div className="mt-1 text-xs text-gray-400">
                            <span>{formatShortDate(expense.date)}</span>
                            {expense.shareAmount > 0 && (
                              <span className="ml-2">
                                Part à rembourser : {formatCurrency(expense.shareAmount)}
                              </span>
                            )}
                          </div>
                          {expense.receiptSent && (
                            <p className="text-xs text-green-600 mt-1">✅ Justificatif envoyé</p>
                          )}
                          {!expense.receiptSent && expense.status === 'pending' && (
                            <p className="text-xs text-amber-500 mt-1">
                              📎 Justificatif non encore envoyé
                            </p>
                          )}
                          {expense.notes && (
                            <p className="text-xs text-gray-400 mt-1 italic">{expense.notes}</p>
                          )}
                          <div className="flex gap-2 mt-2 pt-2 border-t border-gray-50">
                            <button
                              onClick={() => handleEdit(expense)}
                              className="text-xs text-teal-600 font-semibold hover:underline"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Supprimer ce frais ?')) deleteChildExpense(expense.id);
                              }}
                              className="text-xs text-red-400 font-semibold hover:underline"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}

        {childExpenses.length === 0 && (
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="w-full border-2 border-dashed border-purple-200 rounded-2xl py-6 text-center text-purple-500 font-semibold hover:bg-purple-50 transition-colors"
          >
            + Ajouter un premier frais enfant
          </button>
        )}
      </div>
    </>
  );
}
