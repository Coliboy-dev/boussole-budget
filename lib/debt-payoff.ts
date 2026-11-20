import { addMonths, isLocalDate, monthsBetween } from './local-date.ts';
import { toCents } from './money.ts';
import { debtOccurrences, isOpenOccurrence, type Occurrence } from './occurrences.ts';
import type { Debt } from './types.ts';

const lastSupportedDate = '9999-12-31';

export function nextDebtOccurrence(debt: Debt, today: string): Occurrence | undefined {
  const anchor = debt.nextDueDate;
  const start = isLocalDate(anchor) && anchor > today ? anchor : today;
  const skippedCount = Object.keys(debt.occurrenceStatuses ?? {}).length;
  const remainingMonths = monthsBetween(start, lastSupportedDate);
  const through = skippedCount + 1 >= remainingMonths ? lastSupportedDate : addMonths(start, skippedCount + 1);
  return debtOccurrences(debt, today, through).find(isOpenOccurrence);
}

export function estimateDebtEndDate(debt: Debt, next: Occurrence | undefined, today: string): string | undefined {
  const anchor = debt.nextDueDate;
  if (!isLocalDate(anchor) || !next) return undefined;

  const monthly = toCents(debt.monthlyPayment);
  if (monthly <= 0) return next.dueDate < today ? today : next.dueDate;

  const dueToday = debtOccurrences(debt, today, today).filter(isOpenOccurrence);
  const projectedRemaining = dueToday.reduce((remaining, item) => remaining + item.amountCents, toCents(debt.remainingAmount));
  if (projectedRemaining <= 0) return today;

  let firstMonth = Math.max(0, monthsBetween(anchor, today));
  if (addMonths(anchor, firstMonth) <= today) firstMonth += 1;
  const installments = Math.ceil(projectedRemaining / monthly);
  let lastMonth = firstMonth + installments - 1;

  // Paid occurrences are already reflected in remainingAmount. Cancelled ones also leave a gap.
  for (const date of Object.keys(debt.occurrenceStatuses ?? {}).sort()) {
    const month = monthsBetween(anchor, date);
    if (month < firstMonth) continue;
    if (month > lastMonth) break;
    if (addMonths(anchor, month) === date) lastMonth += 1;
  }

  if (lastMonth > monthsBetween(anchor, lastSupportedDate)) return undefined;
  const last = addMonths(anchor, lastMonth);
  if (isLocalDate(debt.endDate) && last > debt.endDate) return undefined;
  return last < today ? today : last;
}
