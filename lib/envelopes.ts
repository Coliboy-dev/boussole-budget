import { addMonths, parseLocalDate } from './local-date.ts';
import { toCents } from './money.ts';
import type { Occurrence } from './occurrences.ts';
import type { Envelope, Spending, SpendingCategory } from './types.ts';

export type EnvelopeOccurrence = Omit<Occurrence, 'type'> & { type: 'envelope' };

const monthFormatter = new Intl.DateTimeFormat('fr-BE', { month: 'long' });

export function spentInMonth(spendings: Spending[], category: SpendingCategory, month: string): number {
  return spendings
    .filter((item) => item.category === category && item.date.slice(0, 7) === month)
    .reduce((total, item) => total + toCents(item.amount), 0);
}

export function envelopeOccurrences(
  envelopes: Envelope[], spendings: Spending[], today: string, end: string,
): EnvelopeOccurrence[] {
  if (envelopes.length === 0) return [];

  const occurrences: EnvelopeOccurrence[] = [];
  for (let dueDate = today; dueDate.length === 10 && dueDate <= end; dueDate = addMonths(`${dueDate.slice(0, 7)}-01`, 1)) {
    const month = dueDate.slice(0, 7);
    const monthName = monthFormatter.format(parseLocalDate(dueDate));
    const current = dueDate === today;
    const period = current
      ? `reste ${/^[ao]/.test(monthName) ? 'd’' : 'de '}${monthName}`
      : monthName;

    for (const envelope of envelopes) {
      const monthlyAmount = toCents(envelope.monthlyAmount);
      const spent = current ? spentInMonth(spendings, envelope.category, month) : 0;
      const remaining = monthlyAmount - spent;
      if (remaining <= 0) continue;
      occurrences.push({
        type: 'envelope', sourceId: envelope.id, dueDate, label: `Enveloppe ${envelope.label} (${period})`,
        amountCents: -remaining, status: 'planned', isEstimated: false,
      });
    }
  }
  return occurrences;
}
