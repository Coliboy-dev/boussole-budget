import type { AppState } from './budget-state.ts';
import { householdCopy, householdMessages } from './household-copy.ts';
import { latestHouseholdRecords, type SequencedHouseholdRecord } from './household-records.ts';
import { toCents } from './money.ts';
import { incomeOccurrences, type Occurrence } from './occurrences.ts';
import { AVAILABLE_HORIZON, buildProjection } from './projection.ts';
import { envelopesOf, spendingsOf } from './spending.ts';
import type { Expense, Income } from './types.ts';

export function contributionOccurrences(incomes: Income[], from: string, through: string): Occurrence[] {
  return incomes.filter(({ type }) => type === 'household_contribution')
    .flatMap((income) => [
      ...incomeOccurrences(income, from, through).filter(({ status }) => status !== 'paid'),
      ...Object.entries(income.occurrenceStatuses ?? {})
        .filter(([date, status]) => status === 'paid' && date >= from && date <= through)
        .map(([date]): Occurrence => ({
          sourceId: income.id, dueDate: date, label: income.label, type: 'income', status: 'paid',
          isEstimated: false, amountCents: income.occurrenceAmountsCents?.[date] ?? toCents(income.amount),
        })),
    ])
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function householdAttention(state: AppState, today: string): string | null {
  const { currentBalance, incomes, expenses, debts, childExpenses, userProfile } = state;
  const projection = buildProjection(currentBalance, incomes, expenses, debts, childExpenses, userProfile.safetyReserve, {
    today, horizon: AVAILABLE_HORIZON, envelopes: envelopesOf(state), spendings: spendingsOf(state),
  });
  const contributionIds = new Set(incomes.filter(({ type }) => type === 'household_contribution').map(({ id }) => id));
  // À date égale, les rentrées de la journée sont disponibles pour les échéances de cette journée.
  const events = [...projection.events].sort((a, b) => a.date.localeCompare(b.date)
    || Number(b.amount > 0) - Number(a.amount > 0));
  let prudent = toCents(currentBalance);
  let estimated = 0;
  let contributions = 0;
  let expectedCount = 0;
  for (const event of events) {
    const cents = toCents(event.amount);
    if (event.isEstimated) {
      estimated += cents;
      if (event.type === 'income' && contributionIds.has(event.sourceId)) {
        contributions += cents;
        expectedCount += 1;
      }
      continue;
    }
    const before = prudent;
    prudent += cents;
    if ((event.type === 'expense' || event.type === 'debt') && before >= 0 && prudent < 0
      && prudent + estimated >= 0 && prudent + estimated - contributions < 0 && expectedCount > 0) {
      return householdMessages.dependsOnContributions(event.label, event.dueDate, expectedCount);
    }
  }

  const lowest = toCents(projection.lowestBalance);
  const reserve = toCents(userProfile.safetyReserve);
  const current = toCents(currentBalance);
  const todayIsLowest = projection.lowestDate === today;
  if (lowest < 0) return todayIsLowest && current < 0
    ? householdCopy.alreadyBelowZero : householdMessages.shortfallBefore(-lowest, projection.lowestDate);
  if (lowest < reserve) {
    const alreadyBelow = todayIsLowest && current < reserve;
    return householdMessages.reserveShortfall(reserve - (alreadyBelow ? current : lowest), projection.lowestDate, alreadyBelow);
  }
  return null;
}

export function mirrorContributions<T extends AppState>(
  personal: T, householdId: string, memberId: string, incomes: Income[],
): T {
  let expenses = personal.expenses;
  for (const income of incomes) {
    if (income.type !== 'household_contribution' || income.contributionMemberId !== memberId || !income.expectedDate) continue;
    const linkedRecordId = `${householdId}|income|${income.id}`;
    const index = expenses.findIndex((expense) => expense.category === 'household' && expense.linkedRecordId === linkedRecordId);
    const existing = expenses[index];
    const scheduled: Expense = {
      ...existing,
      id: existing?.id ?? `household|${linkedRecordId}`,
      linkedRecordId,
      label: householdCopy.contribution,
      category: 'household',
      amount: income.amount,
      frequency: income.frequency,
      dueDate: income.expectedDate,
      trackedFrom: income.expectedDate,
      isPaid: false,
      isRecurring: true,
    };
    if (existing && existing.amount === scheduled.amount && existing.frequency === scheduled.frequency
      && existing.dueDate === scheduled.dueDate) continue;
    if (expenses === personal.expenses) expenses = [...expenses];
    if (existing) expenses[index] = scheduled;
    else expenses.push(scheduled);
  }
  return expenses === personal.expenses ? personal : { ...personal, expenses };
}

export function trustedContributionSchedules(
  incomes: Income[], rows: readonly SequencedHouseholdRecord[], userId: string, cursor: number,
): Income[] {
  const authored = new Set(latestHouseholdRecords(rows)
    .filter(({ record, seq, updatedBy }) => record.kind === 'income' && (seq > cursor || updatedBy === userId))
    .map(({ record }) => record.id));
  return incomes.filter(({ type, id }) => type === 'household_contribution' && authored.has(id));
}
