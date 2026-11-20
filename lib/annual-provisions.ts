import { addMonths, isLocalDate, monthsBetween } from './local-date.ts';
import { monthlyCents, toCents } from './money.ts';
import { expenseOccurrences, isOpenOccurrence } from './occurrences.ts';
import type { Expense } from './types.ts';

/**
 * Mensualités encore possibles avant l’échéance : un versement par mois entier restant.
 * Du 20 novembre au 15 mars, il reste 3 versements (20 déc., 20 janv., 20 févr.).
 */
function contributionsBefore(today: string, dueDate: string): number {
  const months = monthsBetween(today, dueDate) - (Number(today.slice(8)) > Number(dueDate.slice(8)) ? 1 : 0);
  return Math.min(11, Math.max(0, months));
}

/**
 * Montant à garder de côté aujourd’hui pour payer chaque charge annuelle à temps
 * en mettant ensuite 1/12 de côté par mois. La réserve grandit à mesure que
 * l’échéance approche, jusqu’à ce que la facture entre dans la projection.
 */
export function annualProvisionsCents(expenses: Expense[], today: string, end: string): number {
  let total = 0;

  for (const expense of expenses) {
    if (!expense.isRecurring || expense.frequency !== 'annual' || !isLocalDate(expense.dueDate)) continue;

    // Search through a full cycle after the anchor and the last explicitly handled occurrence.
    const lastKnown = Object.keys(expense.occurrenceStatuses ?? {}).reduce(
      (latest, date) => date > latest ? date : latest,
      expense.dueDate > today ? expense.dueDate : today,
    );
    const searchEnd = lastKnown > '9998-12-31' ? '9999-12-31' : addMonths(lastKnown, 12);
    const occurrences = expenseOccurrences(expense, today, searchEnd);
    const nextUnpaid = occurrences.find(isOpenOccurrence);
    const prepaidInPeriod = occurrences.some(({ dueDate, status }) =>
      status === 'paid' && dueDate >= today && dueDate <= end);

    if (nextUnpaid && nextUnpaid.dueDate > end && !prepaidInPeriod) {
      const amount = toCents(expense.amount);
      const stillToSave = monthlyCents(expense.amount, 'annual') * contributionsBefore(today, nextUnpaid.dueDate);
      total += Math.max(0, amount - stillToSave);
    }
  }

  return total;
}
