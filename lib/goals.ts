import { addMonths } from './local-date.ts';
import { fromCents, toCents } from './money.ts';
import type { Occurrence } from './occurrences.ts';
import type { Goal } from './types.ts';

export type GoalOccurrence = Omit<Occurrence, 'type'> & { type: 'goal' };

/** Mises de côté prévues : le mois en cours (sauf si déjà faite), puis le 1er de chaque mois, sans dépasser le reste à épargner. */
function schedule(goal: Goal, today: string, end: string): { dueDate: string; amountCents: number }[] {
  const currentMonth = today.slice(0, 7);
  const contribution = toCents(goal.monthlyContribution ?? 0);
  let remaining = toCents(goal.targetAmount) - toCents(goal.savedAmount);
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
  return goals.filter(({ onCurrentAccount }) => !onCurrentAccount).flatMap((goal) => schedule(goal, today, end)
    .map(({ dueDate, amountCents }): GoalOccurrence => ({
      type: 'goal', sourceId: goal.id, dueDate, label: `Mise de côté : ${goal.label}`,
      amountCents: -amountCents, status: 'planned', isEstimated: false,
    })));
}

/**
 * Épargne gardée sur le compte courant : l'argent ne bouge pas, il est réservé. La réserve comprend ce qui est
 * déjà épargné et, par prudence, les mises de côté prévues sur la période (comme les provisions annuelles).
 */
export function goalSavingsOnAccountCents(goals: readonly Goal[], today: string, end: string): number {
  return goals.filter(({ onCurrentAccount }) => onCurrentAccount).reduce((sum, goal) => sum
    + Math.max(0, toCents(goal.savedAmount))
    + schedule(goal, today, end).reduce((planned, { amountCents }) => planned + amountCents, 0), 0);
}

/** « J'ai mis de côté » : la mise de côté du mois est faite, l'épargne augmente. */
export function recordGoalContribution(goal: Goal, today: string): Pick<Goal, 'savedAmount' | 'lastContributionMonth'> {
  const contribution = toCents(goal.monthlyContribution ?? 0);
  const remaining = Math.max(0, toCents(goal.targetAmount) - toCents(goal.savedAmount));
  return {
    savedAmount: fromCents(toCents(goal.savedAmount) + Math.min(contribution, remaining)),
    lastContributionMonth: today.slice(0, 7),
  };
}

/** Ce qui s'ajoute à la réserve de sécurité, en toutes lettres : « ta réserve{suffixe} ». */
export function reserveExtras(annualProvision: number, goalSavings: number): string {
  if (annualProvision > 0 && goalSavings > 0) return ', tes provisions et ton épargne';
  if (annualProvision > 0) return ' et tes provisions';
  if (goalSavings > 0) return ' et ton épargne';
  return '';
}
