import type { AdviceItem, BudgetSummary, Debt, Income } from './types.ts';
import { calculateUncertainIncome, formatCurrency } from './budget-calculations.ts';
import { todayInBrussels } from './local-date.ts';
import { debtOccurrences } from './occurrences.ts';

export function generateAdvice(
  summary: BudgetSummary,
  incomes: Income[],
  debts: Debt[],
  today = todayInBrussels(),
): AdviceItem[] {
  if (summary.emptyBudget) return [];

  const advice: AdviceItem[] = [];
  const { trueAvailable, safetyReserve, savingsCapacity, availableForecast } = summary;

  if (summary.riskLevel === 'danger') {
    advice.push({
      id: 'adv-danger',
      title: 'Solde prévisionnel négatif',
      message: `Ton solde pourrait descendre à ${formatCurrency(availableForecast.balance)}. Consulte tes prochaines échéances et reporte les dépenses qui peuvent attendre.`,
      type: 'action',
      priority: 1,
    });
  } else if (trueAvailable < 200) {
    advice.push({
      id: 'adv-tight-budget',
      title: trueAvailable < 100 ? 'Budget serré' : 'Surveille ton budget',
      message: `Ton vrai disponible est de ${formatCurrency(trueAvailable)} sur la période. Priorise les dépenses essentielles.`,
      type: 'warning',
      priority: trueAvailable < 100 ? 1 : 2,
    });
  }

  const activeDebts = debts.filter((debt) =>
    debt.remainingAmount > 0 && debt.status !== 'completed' && debt.status !== 'suspended'
  );
  const overdue = activeDebts.filter((debt) =>
    debt.status === 'late' || debtOccurrences(debt, today, today).some(({ status }) => status === 'late')
  );
  if (overdue.length > 0) {
    const label = overdue.length === 1 ? 'dette en retard' : 'dettes en retard';
    advice.push({
      id: 'adv-late-debts',
      title: 'Dettes en retard',
      message: `Tu as ${overdue.length} ${label}. Tu peux vérifier les échéances et le restant dû dans Dettes.`,
      type: 'warning',
      priority: 1,
    });
  }

  const contested = activeDebts.filter(({ status }) => status === 'contested');
  if (contested.length > 0) {
    const label = contested.length === 1 ? 'dette contestée' : 'dettes contestées';
    advice.push({
      id: 'adv-contested',
      title: 'Dettes contestées',
      message: `Ton budget contient ${contested.length} ${label}. Tu peux consulter le statut et le restant dû dans Dettes.`,
      type: 'info',
      priority: 2,
    });
  }

  if (safetyReserve > 0 && availableForecast.balance < safetyReserve) {
    advice.push({
      id: 'adv-reserve',
      title: 'Réserve de sécurité',
      message: `Le point bas prévu de ${formatCurrency(availableForecast.balance)} est sous la réserve de ${formatCurrency(safetyReserve)} que tu as réglée.`,
      type: 'info',
      priority: 2,
    });
  }

  const amountToSave = Math.floor(Math.min(savingsCapacity, trueAvailable * 0.3));
  if (summary.riskLevel !== 'danger' && amountToSave > 10) {
    advice.push({
      id: 'adv-savings',
      title: 'Capacité d’épargne',
      message: `Ta capacité d’épargne est de ${formatCurrency(savingsCapacity)}/mois et ton vrai disponible de ${formatCurrency(trueAvailable)}. Tu peux envisager de mettre ${formatCurrency(amountToSave)} de côté sur cette période.`,
      type: 'positive',
      priority: 3,
    });
  }

  const { count, total } = calculateUncertainIncome(incomes, today, availableForecast.horizon);
  if (count > 0) {
    const label = count === 1 ? 'versement incertain' : 'versements incertains';
    advice.push({
      id: 'adv-income-confirm',
      title: 'Revenus incertains',
      message: `Tu attends ${count} ${label} pour ${formatCurrency(total)} au total sur la période de projection. Le vrai disponible repose sur les rentrées certaines.`,
      type: 'info',
      priority: 4,
    });
  }

  return advice.sort((a, b) => a.priority - b.priority);
}
