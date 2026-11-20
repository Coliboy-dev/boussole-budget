'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import Modal from '@/components/ui/Modal';
import ExpenseForm from '@/components/forms/ExpenseForm';
import ExpenseList from '@/components/budget/ExpenseList';
import Card from '@/components/ui/Card';
import { calculateTotalMonthlyExpenses, calculateTotalMonthlyIncome, formatCurrency } from '@/lib/budget-calculations';
import type { Expense, ExpenseCategory } from '@/lib/types';

const categoryNames: Record<ExpenseCategory, string> = {
  rent: 'Logement',
  energy: 'Énergie',
  phone: 'Téléphone',
  insurance: 'Assurance',
  groceries: 'Courses',
  transport: 'Transport',
  health: 'Santé',
  school: 'Scolarité',
  subscriptions: 'Abonnements',
  other: 'Autre',
};

export default function ChargesPage() {
  const { expenses, incomes, summary, addExpense, updateExpense, deleteExpense } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Expense | null>(null);

  const totalExpenses = calculateTotalMonthlyExpenses(expenses);
  const totalIncome = calculateTotalMonthlyIncome(incomes);
  const ratio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

  const topCategory = Object.keys(categoryNames)
    .map((category) => ({
      name: categoryNames[category as ExpenseCategory],
      amount: calculateTotalMonthlyExpenses(expenses.filter((expense) => expense.category === category)),
    }))
    .filter(({ amount }) => amount > 0)
    .sort((a, b) => b.amount - a.amount)[0];

  function handleEdit(expense: Expense) {
    setEditItem(expense);
    setShowForm(true);
  }

  function handleSubmit(data: Omit<Expense, 'id'>) {
    if (editItem) {
      updateExpense(editItem.id, data);
    } else {
      addExpense(data);
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
          title={editItem ? 'Modifier la charge' : 'Ajouter une charge'}
          onClose={handleClose}
        >
          <ExpenseForm initial={editItem ?? undefined} onSubmit={handleSubmit} onCancel={handleClose} />
        </Modal>
      )}

      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Mes charges</h1>
            <p className="text-sm text-gray-600 mt-0.5">Charges et échéances du budget</p>
          </div>
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-teal-700 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-teal-800 transition-colors shadow-sm"
          >
            + Ajouter
          </button>
        </div>

        <Card className="bg-teal-50 border-teal-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 mb-1">
                Total mensuel
              </p>
              <p className="text-3xl font-bold text-teal-700">{formatCurrency(totalExpenses)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600 mb-1">% des revenus</p>
              <p
                className={`text-lg font-bold ${
                  ratio > 80 ? 'text-red-800' : ratio > 60 ? 'text-amber-800' : 'text-teal-800'
                }`}
              >
                {Math.round(ratio)}%
              </p>
            </div>
          </div>
          <div className="w-full bg-teal-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                ratio > 80 ? 'bg-red-400' : ratio > 60 ? 'bg-amber-400' : 'bg-teal-400'
              }`}
              style={{ width: `${Math.min(100, ratio)}%` }}
            />
          </div>
          {topCategory && (
            <p className="text-xs text-gray-600 mt-2">
              Poste principal :{' '}
              <strong>
                {topCategory.name}
              </strong>{' '}
              ({formatCurrency(topCategory.amount)})
            </p>
          )}
          {summary.availableForecast.annualProvision > 0 && (
            <p className="mt-2 text-sm text-teal-950">
              <strong>{formatCurrency(summary.availableForecast.annualProvision)}</strong> réservés pour les charges annuelles dans le vrai disponible.
            </p>
          )}
        </Card>

        <ExpenseList
          expenses={expenses}
          onEdit={handleEdit}
          onDelete={deleteExpense}
        />

        {expenses.length === 0 && (
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="w-full border-2 border-dashed border-teal-200 rounded-2xl py-6 text-center text-teal-800 font-semibold hover:bg-teal-50 transition-colors"
          >
            + Ajouter ta première charge
          </button>
        )}
      </div>
    </>
  );
}
