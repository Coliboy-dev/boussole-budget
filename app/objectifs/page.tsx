import GoalList from '@/components/goals/GoalList';
import Card from '@/components/ui/Card';
import AlertBanner from '@/components/ui/AlertBanner';
import { formatCurrency } from '@/lib/budget-calculations';
import { mockGoals } from '@/lib/mock-data';

export default function ObjectifsPage() {
  const totalSaved = mockGoals.reduce((s, g) => s + g.savedAmount, 0);
  const totalTarget = mockGoals.reduce((s, g) => s + g.targetAmount, 0);
  const totalMonthlyNeeded = mockGoals.reduce((s, g) => s + (g.monthlyContribution || 0), 0);
  const realisticGoals = mockGoals.filter((g) => g.status === 'realistic').length;

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">🎯 Mes objectifs</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tes projets d&apos;épargne</p>
      </div>

      {/* Summary */}
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

      {realisticGoals === 0 && (
        <AlertBanner variant="warning" title="Objectifs fragiles">
          Tous tes objectifs sont en état fragile ou à reporter. Essaie de dégager plus de marge mensuelle.
        </AlertBanner>
      )}

      <GoalList goals={mockGoals} />

      <Card className="border-dashed border-2 border-gray-200 bg-gray-50">
        <div className="text-center py-2">
          <p className="text-2xl mb-1">➕</p>
          <p className="text-sm font-medium text-gray-600">Ajouter un objectif</p>
          <p className="text-xs text-gray-400 mt-1">Fonctionnalité bientôt disponible</p>
        </div>
      </Card>
    </div>
  );
}
