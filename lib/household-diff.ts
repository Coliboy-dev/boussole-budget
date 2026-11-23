import { convertAmounts, type AppState } from './budget-state.ts';
import type { HouseholdCheckpoint } from './household-balance.ts';
import { occurrenceCollections, sharedCollections, type HouseholdOccurrence } from './household-materialize.ts';
import { householdOperationId, latestHouseholdRecords, type HouseholdRecord, type SequencedHouseholdRecord } from './household-records.ts';
import { toCents } from './money.ts';
import type { Schedule, Spending } from './types.ts';

interface DiffContext {
  rows: readonly SequencedHouseholdRecord[];
  newCheckpointId?: string;
  paymentDate?: string;
  unscheduledPayment?: { id: string; debtId: string; date: string };
}

function householdView(state: AppState): Map<string, HouseholdRecord> {
  const cents = convertAmounts(state, toCents);
  const records = new Map<string, HouseholdRecord>();
  const add = (record: HouseholdRecord) => records.set(householdOperationId(record), record);
  for (const kind of Object.keys(sharedCollections) as (keyof typeof sharedCollections)[]) {
    const items: ({ id: string } & Schedule)[] = cents[sharedCollections[kind]] ?? [];
    for (const { occurrenceStatuses, occurrenceAmountsCents, ...data } of items) {
      add({ kind, id: data.id, data });
      if (!Object.hasOwn(occurrenceCollections, kind)) continue;
      for (const [dueDate, status] of Object.entries(occurrenceStatuses ?? {})) {
        const occurrence: HouseholdOccurrence = { entityKind: kind as HouseholdOccurrence['entityKind'], entityId: data.id, dueDate, status };
        if (status === 'paid' && occurrenceAmountsCents?.[dueDate] !== undefined) {
          occurrence.amountCents = occurrenceAmountsCents[dueDate];
        }
        add({ kind: 'occurrence', id: `${kind}|${data.id}|${dueDate}`, data: occurrence });
      }
    }
  }
  for (const [id, data] of Object.entries(cents.merchantCategories ?? {})) add({ kind: 'merchant', id, data });
  add({ kind: 'settings', id: 'settings', data: { safetyReserve: cents.userProfile.safetyReserve } });
  return records;
}

export function diffHousehold(previous: AppState, next: AppState, context: DiffContext): HouseholdRecord[] {
  const before = householdView(previous);
  const after = householdView(next);
  const latest = latestHouseholdRecords(context.rows);
  const stored = new Map(latest.map(({ record }) => [householdOperationId(record), record]));
  const checkpoint = latest.findLast(({ record }) => record.kind === 'checkpoint' && !!record.data)?.record.data as HouseholdCheckpoint | undefined;
  const changes: HouseholdRecord[] = [];
  const isBankReading = next.balanceRevision !== previous.balanceRevision;
  const balanceDelta = toCents(next.currentBalance) - toCents(previous.currentBalance);

  if (isBankReading) {
    if (!context.newCheckpointId || !next.balanceDate) throw new Error('Relevé du foyer incomplet.');
    const id = context.newCheckpointId;
    changes.push({ kind: 'checkpoint', id, data: { checkpointId: id, date: next.balanceDate, amount: toCents(next.currentBalance) } });
  }

  for (const [key, record] of after) {
    const old = before.get(key);
    // Les révisions numériques des dépenses sont reconstruites à partir de leur relevé.
    if (record.kind === 'spending') {
      const spending = record.data as Spending;
      const attached = stored.get(key)?.balanceEffect?.checkpointId ?? checkpoint?.checkpointId;
      if (spending.debited && !attached) throw new Error('Recopie le solde du foyer avant de saisir une dépense débitée.');
      record.data = { ...spending, balanceRevision: 0 };
      if (old?.data) old.data = { ...old.data as Spending, balanceRevision: 0 };
      if (spending.debited && attached) record.balanceEffect = { checkpointId: attached, deltaCents: -spending.amount };
    }
    if (JSON.stringify(old?.data) === JSON.stringify(record.data)) continue;

    if (record.kind === 'occurrence' && !isBankReading && balanceDelta !== 0 && !context.unscheduledPayment) {
      const occurrence = record.data as HouseholdOccurrence;
      if (occurrence.status === 'paid') {
        if (!checkpoint) throw new Error('Recopie le solde du foyer avant de saisir un paiement.');
        record.balanceEffect = { checkpointId: checkpoint.checkpointId, deltaCents: balanceDelta };
        if (context.paymentDate) occurrence.paymentDate = context.paymentDate;
      }
    }
    changes.push(record);
  }

  for (const [key, { kind, id, data }] of before) {
    if (after.has(key)) continue;
    // Supprimer une charge récurrente ne retire pas ses paiements historiques.
    if (kind === 'occurrence') {
      const { entityKind, entityId } = data as HouseholdOccurrence;
      if (!after.has(`${entityKind}|${entityId}`)) continue;
    }
    changes.push({ kind, id });
  }

  if (context.unscheduledPayment && balanceDelta !== 0) {
    if (!checkpoint) throw new Error('Recopie le solde du foyer avant de saisir un paiement.');
    const { id, ...data } = context.unscheduledPayment;
    changes.push({ kind: 'debt-payment', id, data, balanceEffect: { checkpointId: checkpoint.checkpointId, deltaCents: balanceDelta } });
  }
  return changes;
}
