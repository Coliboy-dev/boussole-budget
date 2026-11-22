import type { AppState } from './budget-state.ts';
import { fromCents } from './money.ts';
import { latestHouseholdRecords, type SequencedHouseholdRecord } from './household-records.ts';
import { isLocalDate } from './local-date.ts';

export interface HouseholdCheckpoint {
  checkpointId: string;
  amount: number;
  date: string;
}

export function createHouseholdCheckpoint(amountCents: number, date: string): HouseholdCheckpoint {
  return { checkpointId: crypto.randomUUID(), amount: amountCents, date };
}

export function materializeHouseholdBalance(
  state: AppState,
  rows: readonly SequencedHouseholdRecord[],
): AppState {
  const operations = latestHouseholdRecords(rows).map(({ record }) => record).filter(({ data }) => data !== undefined);
  const checkpoints = operations.filter(({ kind }) => kind === 'checkpoint').map(({ data }) => data as HouseholdCheckpoint);
  const current = checkpoints.at(-1);
  if (!current) return state;

  // Le réducteur compare des révisions numériques. Chaque UUID reçoit une révision distincte dans cet instantané.
  const revisions = new Map(checkpoints.map(({ checkpointId }, index) => [checkpointId, index + 1]));
  const spendingCheckpoints = new Map(operations
    .filter(({ kind }) => kind === 'spending')
    .map(({ id, balanceEffect }) => [id, balanceEffect?.checkpointId]));
  const balanceCents = operations.reduce(
    (amount, { balanceEffect }) => balanceEffect?.checkpointId === current.checkpointId
      ? amount + balanceEffect.deltaCents : amount,
    current.amount,
  );
  const balanceDate = operations.reduce((date, { kind, data, balanceEffect }) => {
    if (balanceEffect?.checkpointId !== current.checkpointId) return date;
    const dated = data as { paymentDate?: string; date?: string };
    const operationDate = kind === 'occurrence' ? dated.paymentDate : kind === 'debt-payment' ? dated.date : undefined;
    return isLocalDate(operationDate) && operationDate > date ? operationDate : date;
  }, current.date);

  return {
    ...state,
    currentBalance: fromCents(balanceCents),
    balanceDate,
    balanceRevision: checkpoints.length,
    ...(state.spendings && { spendings: state.spendings.map((spending) => {
      const checkpointId = spendingCheckpoints.get(spending.id);
      return { ...spending, balanceRevision: checkpointId ? revisions.get(checkpointId) ?? 0 : 0 };
    }) }),
  };
}
