import { addMonths } from './local-date.ts';
import { fromCents, toCents } from './money.ts';
import type { Occurrence } from './occurrences.ts';
import type { AppState } from './budget-state.ts';
import type { Goal } from './types.ts';

export type GoalOccurrence = Omit<Occurrence, 'type'> & { type: 'goal' };

type GoalAmounts = Pick<Goal, 'monthlyContribution' | 'targetAmount' | 'savedAmount'>;
export type GoalContributionPlan = GoalAmounts & Pick<Goal, 'lastContributionMonth'>;

export function remainingGoalCents(goal: Pick<Goal, 'targetAmount' | 'savedAmount'>): number {
  return Math.max(0, toCents(goal.targetAmount) - toCents(goal.savedAmount));
}

export function goalContributionCents(goal: GoalAmounts): number {
  return Math.min(Math.max(0, toCents(goal.monthlyContribution ?? 0)), remainingGoalCents(goal));
}

/** Mises de côté prévues : le mois en cours (sauf si déjà faite), puis le 1er de chaque mois, sans dépasser le reste à épargner. */
export function scheduleGoalContributions(goal: GoalContributionPlan, today: string, end: string): { dueDate: string; amountCents: number }[] {
  const currentMonth = today.slice(0, 7);
  const contribution = goalContributionCents(goal);
  let remaining = remainingGoalCents(goal);
  const planned: { dueDate: string; amountCents: number }[] = [];
  if (contribution <= 0) return planned;
  for (let dueDate = today; remaining > 0 && dueDate.length === 10 && dueDate <= end; dueDate = addMonths(`${dueDate.slice(0, 7)}-01`, 1)) {
    if (dueDate.slice(0, 7) === currentMonth && goal.lastContributionMonth === currentMonth) continue;
    const amountCents = Math.min(contribution, remaining);
    remaining -= amountCents;
    planned.push({ dueDate, amountCents });
  }
  return planned;
}

/**
 * Épargne sur un compte à part : chaque mise de côté est un virement qui quitte le compte courant,
 * elle entre donc dans la projection comme une sortie (et peut révéler un découvert).
 */
export function goalOccurrences(goals: readonly Goal[], today: string, end: string): GoalOccurrence[] {
  return goals.filter(({ onCurrentAccount }) => !onCurrentAccount).flatMap((goal) => scheduleGoalContributions(goal, today, end)
    .map(({ dueDate, amountCents }): GoalOccurrence => ({
      type: 'goal', sourceId: goal.id, dueDate, label: `Mise de côté : ${goal.label}`,
      amountCents: -amountCents, status: 'planned', isEstimated: false,
    })));
}

/**
 * Épargne gardée sur le compte courant : l'argent ne bouge pas, il est réservé. On réserve ce qui est déjà épargné
 * et la mise de côté du mois en cours si elle n'est pas encore faite. Celles des mois suivants seront réservées
 * le moment venu : les revenus de ces mois-là les financeront.
 */
export function goalReserveOnAccount(goals: readonly Goal[], today: string): { savedCents: number; thisMonthCents: number } {
  const month = today.slice(0, 7);
  return goals.filter(({ onCurrentAccount }) => onCurrentAccount).reduce((total, goal) => ({
    savedCents: total.savedCents + Math.max(0, toCents(goal.savedAmount)),
    thisMonthCents: total.thisMonthCents + scheduleGoalContributions(goal, today, `${month}-31`)
      .filter(({ dueDate }) => dueDate.slice(0, 7) === month)
      .reduce((sum, { amountCents }) => sum + amountCents, 0),
  }), { savedCents: 0, thisMonthCents: 0 });
}

export function goalSavingsOnAccountCents(goals: readonly Goal[], today: string): number {
  const { savedCents, thisMonthCents } = goalReserveOnAccount(goals, today);
  return savedCents + thisMonthCents;
}

/** « J'ai mis de côté » : la mise de côté du mois est faite, l'épargne augmente. */
export function recordGoalContribution(goal: Goal, today: string): Pick<Goal, 'savedAmount' | 'lastContributionMonth'> {
  return {
    savedAmount: fromCents(toCents(goal.savedAmount) + goalContributionCents(goal)),
    lastContributionMonth: today.slice(0, 7),
  };
}

/**
 * « J'ai mis de côté » appliqué au budget. Sur un compte à part, le virement quitte le compte courant : il est déduit
 * du solde, sauf si le solde recopié le comprend déjà (audit C01). Sur le compte courant, l'argent ne bouge pas.
 */
export function contributeToGoal(state: AppState, id: string, today: string, balanceIncludesTransfer: boolean): AppState {
  const goal = state.goals.find((item) => item.id === id);
  if (!goal || goal.lastContributionMonth === today.slice(0, 7)) return state;
  const update = recordGoalContribution(goal, today);
  const transferCents = toCents(update.savedAmount) - toCents(goal.savedAmount);
  const leavesAccount = !goal.onCurrentAccount && transferCents > 0 && !balanceIncludesTransfer;
  return {
    ...state,
    goals: state.goals.map((item) => item.id === id ? { ...item, ...update } : item),
    ...(leavesAccount && { currentBalance: fromCents(toCents(state.currentBalance) - transferCents), balanceDate: today }),
  };
}

/**
 * Le virement du mois vers un compte à part a pu partir avant le dernier solde recopié (recopié ce mois-ci) :
 * on le demande plutôt que de le déduire deux fois.
 */
export function goalTransferMayBeInBalance(goal: Goal, balanceDate: string | undefined, today: string): boolean {
  return !goal.onCurrentAccount && balanceDate !== undefined && balanceDate.slice(0, 7) === today.slice(0, 7);
}

/** Ce qui s'ajoute à la réserve de sécurité, en toutes lettres : « ta réserve{suffixe} ». */
export function reserveExtras(annualProvision: number, goalSavings: number): string {
  if (annualProvision > 0 && goalSavings > 0) return ', tes provisions et ton épargne';
  if (annualProvision > 0) return ' et tes provisions';
  if (goalSavings > 0) return ' et ton épargne';
  return '';
}
