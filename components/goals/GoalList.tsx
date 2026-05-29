import GoalCard from './GoalCard';
import type { Goal } from '@/lib/types';

interface GoalListProps {
  goals: Goal[];
}

export default function GoalList({ goals }: GoalListProps) {
  if (goals.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-4xl mb-2">🎯</p>
        <p className="text-sm">Aucun objectif défini pour l&apos;instant.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} />
      ))}
    </div>
  );
}
