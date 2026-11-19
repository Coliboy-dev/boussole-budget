import type { AdviceItem, BudgetSummary, Debt, Income } from './types.ts';
import { formatCurrency } from './budget-calculations.ts';
import { addDays, todayInBrussels } from './local-date.ts';
import { debtOccurrences, incomeOccurrences, isOpenOccurrence } from './occurrences.ts';

export function generateAdvice(
  summary: BudgetSummary,
  incomes: Income[],
  debts: Debt[],
  today = todayInBrussels(),
): AdviceItem[] {
  if (summary.emptyBudget) return [];

  const advice: AdviceItem[] = [];
  const { trueAvailable, safetyReserve, availableForecast } = summary;

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
    const debtCount = overdue.length === 1 ? 'une dette en retard' : `${overdue.length} dettes en retard`;
    advice.push({
      id: 'adv-late-debts',
      title: 'Dettes en retard',
      message: `Tu as ${debtCount}. Vérifie les échéances et le montant restant à rembourser.`,
      type: 'warning',
      priority: 1,
    });
  }

  const contested = activeDebts.filter(({ status }) => status === 'contested');
  if (contested.length > 0) {
    const debtCount = contested.length === 1 ? 'une dette contestée' : `${contested.length} dettes contestées`;
    advice.push({
      id: 'adv-contested',
      title: 'Dettes contestées',
      message: `Ton budget contient ${debtCount}. Garde à portée de main les documents liés à ces dettes.`,
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

  const amountToSave = Math.floor(Math.min(summary.savingsCapacity, trueAvailable * 0.3));
  if (summary.riskLevel !== 'danger' && amountToSave > 10) {
    advice.push({
      id: 'adv-savings',
      title: 'Capacité d’épargne',
      message: `Selon ta marge mensuelle et ton vrai disponible, tu peux envisager de mettre de côté ${formatCurrency(amountToSave)}.`,
      type: 'positive',
      priority: 3,
    });
  }

  const end = addDays(today, availableForecast.horizon);
  const hasUncertainIncome = incomes.some((income) =>
    !income.isConfirmed && incomeOccurrences(income, today, end).some(isOpenOccurrence)
  );
  if (hasUncertainIncome) {
    advice.push({
      id: 'adv-income-confirm',
      title: 'Revenus incertains',
      message: 'Tu as des versements incertains prévus sur cette période. Ils figurent à part dans la projection.',
      type: 'info',
      priority: 4,
    });
  }

  return advice.sort((a, b) => a.priority - b.priority);
}
