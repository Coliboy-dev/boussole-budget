'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import Modal from '@/components/ui/Modal';
import GoalForm from '@/components/forms/GoalForm';
import GoalList from '@/components/goals/GoalList';
import Card from '@/components/ui/Card';
import AlertBanner from '@/components/ui/AlertBanner';
import {
  assessBudgetGoals,
  calculateGoalFeasibility,
  calculateGoalTotals,
  formatCurrency,
} from '@/lib/budget-calculations';
import { goalTransferMayBeInBalance, recordGoalContribution } from '@/lib/goals';
import { useHouseholdWorkspace } from '@/components/household/HouseholdWorkspace';
import PaymentBalanceQuestion from '@/components/budget/PaymentBalanceQuestion';
import { fromCents, toCents } from '@/lib/money';
import type { Goal } from '@/lib/types';

export default function ObjectifsPage() {
  const { goals, summary, today, addGoal, updateGoal, deleteGoal, contributeToGoal, storageBlocked, currentBalance, balanceDate } = useApp();
  const { active: household } = useHouseholdWorkspace();
  const [asking, setAsking] = useState<Goal>();
  const savedOnAccount = goals.filter(({ onCurrentAccount }) => onCurrentAccount).reduce((sum, { savedAmount }) => sum + toCents(savedAmount), 0);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Goal | null>(null);

  const totals = calculateGoalTotals(goals);
  const assessedGoals = assessBudgetGoals(goals, summary.monthlyMargin, today);
  const hasRealisticGoal = assessedGoals.some(({ feasibility }) => feasibility.status === 'realistic');

  function handleEdit(goal: Goal) {
    setEditItem(goal);
    setShowForm(true);
  }

  function handleSubmit(data: Omit<Goal, 'id' | 'status'>) {
    if (editItem) {
      updateGoal(editItem.id, data);
    } else {
      addGoal({ ...data, status: calculateGoalFeasibility(data, summary.savingsCapacity, today) });
    }
    setShowForm(false);
    setEditItem(null);
  }

  /** Compte à part : le virement quitte le compte courant ; s'il a pu partir avant le dernier solde recopié, on demande. */
  function contribute(goal: Goal, balanceIncludesTransfer?: boolean) {
    setAsking(undefined);
    if (balanceIncludesTransfer === undefined && !household && goalTransferMayBeInBalance(goal, balanceDate, today)) {
      setAsking(goal);
      return;
    }
    contributeToGoal(goal.id, balanceIncludesTransfer ?? false);
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
            <h1 className="text-xl font-bold text-gray-800">Mes objectifs</h1>
            <p className="text-sm text-gray-600 mt-0.5">Tes projets d&apos;épargne</p>
          </div>
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-teal-700 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-teal-800 transition-colors shadow-sm"
          >
            + Ajouter
          </button>
        </div>

        <Card className="bg-teal-50 border-teal-200">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-gray-600 mb-1">Épargné</p>
              <p className="text-lg font-bold text-teal-700">{formatCurrency(totals.saved)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Objectif total</p>
              <p className="text-lg font-bold text-gray-700">{formatCurrency(totals.target)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">À mettre de côté /mois</p>
              <p className="text-lg font-bold text-teal-800">{formatCurrency(totals.monthly)}</p>
            </div>
          </div>
        </Card>

        {savedOnAccount > toCents(currentBalance) && (
          <AlertBanner variant="warning" title="Épargne plus élevée que ton solde">
            Tu indiques {formatCurrency(fromCents(savedOnAccount))} épargnés sur ton compte courant, mais ton solde est de {formatCurrency(currentBalance)}.
            Vérifie ton solde, ou modifie l’objectif si cet argent est sur un compte à part.
          </AlertBanner>
        )}

        {goals.length > 0 && !hasRealisticGoal && (
          <AlertBanner variant="warning" title="Objectifs fragiles">
            Tous tes objectifs sont fragiles ou à reporter. Chaque carte indique ce qui bloque.
          </AlertBanner>
        )}

        <GoalList goals={assessedGoals} onEdit={handleEdit} onDelete={deleteGoal} currentMonth={today.slice(0, 7)} transferDeducted={!household}
          onContribute={storageBlocked ? undefined : (goal) => contribute(goal)} />
        {asking && balanceDate && (
          <PaymentBalanceQuestion subject="ce virement" label={`Mise de côté : ${asking.label}`} balanceDate={balanceDate}
            amount={fromCents(toCents(recordGoalContribution(asking, today).savedAmount) - toCents(asking.savedAmount))}
            onAnswer={(included) => contribute(asking, included)} onClose={() => setAsking(undefined)} />
        )}

        {goals.length === 0 && (
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="w-full border-2 border-dashed border-teal-200 rounded-2xl py-6 text-center text-teal-800 font-semibold hover:bg-teal-50 transition-colors"
          >
            + Définir ton premier objectif
          </button>
        )}
      </div>
    </>
  );
}
