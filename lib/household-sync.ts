import {
  decryptHouseholdRecord, encryptHouseholdRecord, householdRecordId, type EncryptedHouseholdRecord,
  type HouseholdRecord, type SequencedHouseholdRecord,
} from './household-records.ts';

export type HouseholdWrite = EncryptedHouseholdRecord & { write_id: string };
export type ConfirmedHouseholdRecord = EncryptedHouseholdRecord & { seq: number };

export interface HouseholdQueue {
  cursor: number;
  confirmed: ConfirmedHouseholdRecord[];
  pending: HouseholdWrite[];
}

interface HouseholdSyncResult {
  cursor: number;
  rows: ConfirmedHouseholdRecord[];
  acknowledged: string[];
}

export interface HouseholdRemote {
  push(rows: HouseholdWrite[]): Promise<{ record_id: string; seq: number }[]>;
  pull(after: number): Promise<ConfirmedHouseholdRecord[]>;
}

const pushLimit = 500;
const pullLimit = 1000;

export function encodeHouseholdWrites(
  key: CryptoKey,
  scope: { householdId: string; keyVersion: number },
  records: readonly HouseholdRecord[],
): Promise<HouseholdWrite[]> {
  return Promise.all(records.map(async (record) => {
    const recordId = await householdRecordId(scope.householdId, record.kind, record.id);
    const encrypted = await encryptHouseholdRecord(key, { ...scope, recordId }, record);
    return { ...encrypted, write_id: crypto.randomUUID() };
  }));
}

export function decodeHouseholdView(
  key: CryptoKey, householdId: string, { confirmed, pending, cursor }: HouseholdQueue,
): Promise<SequencedHouseholdRecord[]> {
  const visible = new Map<string, ConfirmedHouseholdRecord>();
  for (const row of confirmed) visible.set(row.record_id, row);
  pending.forEach((row, index) => visible.set(row.record_id, { ...row, seq: cursor + index + 1 }));
  return Promise.all([...visible.values()].map(async (row) => ({
    seq: row.seq, record: await decryptHouseholdRecord(key, householdId, row),
  })));
}

export async function syncHousehold(remote: HouseholdRemote, queue: HouseholdQueue): Promise<HouseholdSyncResult> {
  const sending = queue.pending.slice(0, pushLimit);
  const receipts = sending.length ? await remote.push(sending) : [];
  if (receipts.length !== sending.length || receipts.some((receipt, index) => (
    receipt.record_id !== sending[index].record_id || !Number.isSafeInteger(receipt.seq) || receipt.seq < 1
  ))) {
    throw new Error('Réponse de synchronisation du foyer incomplète.');
  }

  const rows: ConfirmedHouseholdRecord[] = [];
  let cursor = queue.cursor;
  let page: ConfirmedHouseholdRecord[];
  // Seule la lecture avance le curseur : un accusé peut correspondre à un ancien envoi.
  do {
    page = await remote.pull(cursor);
    for (const row of page) {
      if (!Number.isSafeInteger(row.seq) || row.seq <= cursor) throw new Error('Ordre des éléments du foyer invalide.');
      rows.push(row);
      cursor = row.seq;
    }
  } while (page.length === pullLimit);
  if (receipts.some(({ seq }) => seq > cursor)) throw new Error('Écriture du foyer en attente de confirmation.');

  return { cursor, rows, acknowledged: sending.map(({ write_id }) => write_id) };
}

export function reconcileHouseholdSync(queue: HouseholdQueue, result: HouseholdSyncResult): HouseholdQueue {
  const confirmed = new Map(queue.confirmed.map(row => [row.record_id, row]));
  for (const row of result.rows) {
    if (row.seq > (confirmed.get(row.record_id)?.seq ?? 0)) confirmed.set(row.record_id, row);
  }
  const sent = new Set(result.acknowledged);
  return {
    cursor: Math.max(queue.cursor, result.cursor),
    confirmed: [...confirmed.values()],
    pending: queue.pending.filter(({ write_id }) => !sent.has(write_id)),
  };
}
