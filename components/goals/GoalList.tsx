'use client';

import GoalCard from './GoalCard';
import type { Goal } from '@/lib/types';
import { Target } from 'lucide-react';
import { Icon } from '@/components/ui/icons';

interface GoalListProps {
  goals: Goal[];
  onEdit?: (goal: Goal) => void;
  onDelete?: (id: string) => void;
}

export default function GoalList({ goals, onEdit, onDelete }: GoalListProps) {
  if (goals.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600">
        <Icon icon={Target} className="mx-auto mb-2 size-9 text-teal-700" />
        <p className="text-sm">Aucun objectif défini pour l&apos;instant.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}
