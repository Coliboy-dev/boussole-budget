'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import Modal from '@/components/ui/Modal';
import GoalForm from '@/components/forms/GoalForm';
import GoalList from '@/components/goals/GoalList';
import Card from '@/components/ui/Card';
import AlertBanner from '@/components/ui/AlertBanner';
import { formatCurrency } from '@/lib/budget-calculations';
import type { Goal } from '@/lib/types';

export default function ObjectifsPage() {
  const { goals, addGoal, updateGoal, deleteGoal } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Goal | null>(null);

  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalMonthlyNeeded = goals.reduce((s, g) => s + (g.monthlyContribution || 0), 0);
  const realisticGoals = goals.filter((g) => g.status === 'realistic').length;

  function handleEdit(goal: Goal) {
    setEditItem(goal);
    setShowForm(true);
  }

  function handleSubmit(data: Omit<Goal, 'id'>) {
    if (editItem) {
      updateGoal(editItem.id, data);
    } else {
      addGoal(data);
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
          title={editItem ? "Modifier l'objectif" : 'Ajouter un objectif'}
          onClose={handleClose}
        >
          <GoalForm initial={editItem ?? undefined} onSubmit={handleSubmit} onCancel={handleClose} />
        </Modal>
      )}

      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">🎯 Mes objectifs</h1>
            <p className="text-sm text-gray-500 mt-0.5">Tes projets d&apos;épargne</p>
          </div>
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-teal-500 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-teal-600 transition-colors shadow-sm"
          >
            + Ajouter
          </button>
        </div>

        <Card className="bg-teal-50 border-teal-200">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-gray-500 mb-1">Épargné</p>
              <p className="text-lg font-bold text-teal-700">{formatCurrency(totalSaved)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Objectif total</p>
              <p className="text-lg font-bold text-gray-700">{formatCurrency(totalTarget)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">/mois réservé</p>
              <p className="text-lg font-bold text-teal-600">{formatCurrency(totalMonthlyNeeded)}</p>
            </div>
          </div>
        </Card>

        {goals.length > 0 && realisticGoals === 0 && (
          <AlertBanner variant="warning" title="Objectifs fragiles">
            Tous tes objectifs sont en état fragile ou à reporter. Essaie de dégager plus de marge
            mensuelle.
          </AlertBanner>
        )}

        <GoalList goals={goals} onEdit={handleEdit} onDelete={(id) => { if (confirm('Supprimer cet objectif ?')) deleteGoal(id); }} />

        {goals.length === 0 && (
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="w-full border-2 border-dashed border-teal-200 rounded-2xl py-6 text-center text-teal-500 font-semibold hover:bg-teal-50 transition-colors"
          >
            + Définir ton premier objectif
          </button>
        )}
      </div>
    </>
  );
}
