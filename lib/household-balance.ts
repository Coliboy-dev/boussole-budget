import type { AppState } from './budget-state.ts';
import { fromCents } from './money.ts';

interface HouseholdCheckpoint {
  checkpointId: string;
  amount: number;
  date: string;
}

export type SequencedHouseholdCheckpoint = HouseholdCheckpoint & { seq: number };

export interface HouseholdBalanceEffect {
  checkpointId: string;
  deltaCents: number;
}

export function createHouseholdCheckpoint(amountCents: number, date: string): HouseholdCheckpoint {
  return { checkpointId: crypto.randomUUID(), amount: amountCents, date };
}

export function materializeHouseholdBalance(
  state: AppState,
  checkpoints: readonly SequencedHouseholdCheckpoint[],
  effects: readonly HouseholdBalanceEffect[],
  spendingCheckpoints: ReadonlyMap<string, string>,
): AppState {
  const ordered = [...checkpoints].sort((a, b) => a.seq - b.seq);
  const current = ordered.at(-1);
  if (!current) return state;

  // Le réducteur compare des révisions numériques. Chaque UUID reçoit une révision distincte dans cet instantané.
  const revisions = new Map(ordered.map(({ checkpointId }, index) => [checkpointId, index + 1]));
  const balanceCents = effects.reduce(
    (amount, effect) => effect.checkpointId === current.checkpointId ? amount + effect.deltaCents : amount,
    current.amount,
  );

  return {
    ...state,
    currentBalance: fromCents(balanceCents),
    balanceDate: current.date,
    balanceRevision: ordered.length,
    ...(state.spendings && { spendings: state.spendings.map((spending) => {
      const checkpointId = spendingCheckpoints.get(spending.id);
      return { ...spending, balanceRevision: checkpointId ? revisions.get(checkpointId) ?? 0 : 0 };
    }) }),
  };
}
