import { isBudgetAmount } from './budget-schema.ts';
import { isLocalDate } from './local-date.ts';
import { fromCents, toCents } from './money.ts';
import type { BudgetSummary } from './types.ts';

type Forecast = Pick<BudgetSummary['availableForecast'], 'dailyBalances' | 'reservedAmount'>;

export function simulatePurchase({ dailyBalances, reservedAmount }: Forecast, amount: number, date: string) {
  const first = dailyBalances[0];
  const last = dailyBalances.at(-1);
  if (!first || !last || !isLocalDate(date) || date < first.date || date > last.date
    || !isBudgetAmount(amount) || toCents(amount) <= 0) return null;

  const purchaseCents = toCents(amount);
  let lowestCents = Infinity;
  let lowestDate = first.date;

  for (const point of dailyBalances) {
    const projected = toCents(point.balance) - (point.date >= date ? purchaseCents : 0);
    if (projected < lowestCents) {
      lowestCents = projected;
      lowestDate = point.date;
    }
  }

  const available = lowestCents - toCents(reservedAmount);
  return {
    affordable: available >= 0,
    lowestDate,
    lowestBalance: fromCents(lowestCents),
    available: fromCents(available),
  };
}
