import type { AppState } from './budget-state.ts';
import { householdCopy, householdMessages } from './household-copy.ts';
import { isHouseholdEditByMember, latestHouseholdRecords, type SequencedHouseholdRecord } from './household-records.ts';
import { toCents } from './money.ts';
import { expenseOccurrences, incomeOccurrences, isOpenOccurrence, type Occurrence } from './occurrences.ts';
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
  source?: { seq: number; today: string },
): T {
  let expenses = personal.expenses;
  for (const income of incomes) {
    if (income.type !== 'household_contribution' || income.contributionMemberId !== memberId || !income.expectedDate) continue;
    const linkedRecordId = contributionLink(householdId, income.id);
    const index = expenses.findIndex((expense) => expense.category === 'household' && expense.linkedRecordId === linkedRecordId);
    const existing = expenses[index];
    if (source && source.seq < (existing?.linkedRecordSeq ?? 0)) continue;
    const reopening = existing && !existing.isRecurring && source && source.today > income.expectedDate;
    const scheduled: Expense = {
      ...existing,
      id: existing?.id ?? `household|${linkedRecordId}`,
      linkedRecordId,
      ...(source && { linkedRecordSeq: source.seq }),
      label: householdCopy.contribution,
      category: 'household',
      amount: income.amount,
      frequency: income.frequency,
      dueDate: income.expectedDate,
      trackedFrom: reopening ? source.today : income.expectedDate,
      endDate: income.endDate,
      isPaid: false,
      isRecurring: true,
    };
    if (existing && sameMirrorSchedule(existing, income) && existing.linkedRecordSeq === scheduled.linkedRecordSeq) continue;
    if (expenses === personal.expenses) expenses = [...expenses];
    if (existing) expenses[index] = scheduled;
    else expenses.push(scheduled);
  }
  return expenses === personal.expenses ? personal : { ...personal, expenses };
}

export function trustedContributionSchedules(
  incomes: Income[], rows: readonly SequencedHouseholdRecord[], userId: string, cursor: number, memberId?: string,
): Income[] {
  const authored = new Set(latestHouseholdRecords(rows)
    .filter((row) => row.record.kind === 'income' && isHouseholdEditByMember(row, userId, memberId, cursor))
    .map(({ record }) => record.id));
  return incomes.filter(({ type, id }) => type === 'household_contribution' && authored.has(id));
}

type MirrorSchedule = { kind: 'schedule'; income: Income; seq: number };
export type ContributionMirrorChange = MirrorSchedule | { kind: 'close'; id: string; seq: number };
export type ContributionMirrorPlan = { automatic: ContributionMirrorChange[]; proposals: MirrorSchedule[] };

function contributionLink(householdId: string, incomeId: string): string {
  return `${householdId}|income|${incomeId}`;
}

export function findContributionMirror(expenses: Expense[], householdId: string, incomeId: string): Expense | undefined {
  const link = contributionLink(householdId, incomeId);
  return expenses.find(({ category, linkedRecordId }) => category === 'household' && linkedRecordId === link);
}

function sameMirrorSchedule(expense: Expense, income: Income): boolean {
  return expense.isRecurring && expense.amount === income.amount && expense.frequency === income.frequency
    && expense.dueDate === income.expectedDate && expense.endDate === income.endDate;
}

export function contributionMirrorPlan(
  incomes: Income[], rows: readonly SequencedHouseholdRecord[], userId: string, memberId: string, cursor: number,
): ContributionMirrorPlan {
  const plan: ContributionMirrorPlan = { automatic: [], proposals: [] };
  const trusted = new Set(trustedContributionSchedules(incomes, rows, userId, cursor, memberId).map(({ id }) => id));
  const byId = new Map(incomes.map((income) => [income.id, income]));

  for (const { seq, record } of latestHouseholdRecords(rows)) {
    if (record.kind !== 'income') continue;
    const income = byId.get(record.id);
    if (income?.type === 'household_contribution' && income.contributionMemberId === memberId) {
      if (!income.expectedDate) continue;
      const schedule: MirrorSchedule = { kind: 'schedule', income, seq: Math.min(seq, cursor) };
      if (trusted.has(income.id)) plan.automatic.push(schedule);
      else plan.proposals.push(schedule);
    } else if (seq <= cursor) {
      plan.automatic.push({ kind: 'close', id: record.id, seq });
    }
  }
  return plan;
}

export function contributionMirrorNeedsUpdate(expenses: Expense[], householdId: string, schedule: MirrorSchedule): boolean {
  const mirror = findContributionMirror(expenses, householdId, schedule.income.id);
  return !mirror || (schedule.seq >= (mirror.linkedRecordSeq ?? 0) && !sameMirrorSchedule(mirror, schedule.income));
}

export function applyContributionMirrorChanges<T extends AppState>(
  personal: T, householdId: string, memberId: string, changes: ContributionMirrorChange[], today: string,
): T {
  let next = personal;
  for (const change of changes) {
    if (change.kind === 'schedule') {
      next = mirrorContributions(next, householdId, memberId, [change.income], { seq: change.seq, today });
      continue;
    }
    const link = contributionLink(householdId, change.id);
    const index = next.expenses.findIndex(({ category, linkedRecordId }) => category === 'household' && linkedRecordId === link);
    const mirror = next.expenses[index];
    if (!mirror || change.seq <= (mirror.linkedRecordSeq ?? 0)) continue;
    const closed: Expense = { ...mirror, linkedRecordSeq: change.seq };
    if (mirror.isRecurring) {
      // Le moteur relit aussi les échéances en retard et utilise une date de fin inclusive.
      const occurrences = expenseOccurrences(mirror, today, today).filter(isOpenOccurrence);
      if (occurrences.length) {
        const statuses = { ...mirror.occurrenceStatuses };
        for (const { dueDate } of occurrences) statuses[dueDate] = 'cancelled';
        closed.occurrenceStatuses = statuses;
      }
      closed.isRecurring = false;
      closed.endDate = today;
    }
    const expenses = [...next.expenses];
    expenses[index] = closed;
    next = { ...next, expenses };
  }
  return next;
}
