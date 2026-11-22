import { fromBase64, randomBytes, toBase64 } from './cloud-crypto.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const kinds = [
  'settings', 'member', 'income', 'expense', 'debt', 'envelope', 'goal',
  'spending', 'transfer', 'gap', 'occurrence', 'checkpoint', 'child-expense', 'merchant', 'debt-payment',
] as const;

export type HouseholdRecordKind = (typeof kinds)[number];
type RecordIdentity = { kind: HouseholdRecordKind; id: string };
export interface HouseholdBalanceEffect {
  checkpointId: string;
  deltaCents: number;
}

export type HouseholdRecord = RecordIdentity & {
  data?: unknown;
  balanceEffect?: HouseholdBalanceEffect;
};

export interface SequencedHouseholdRecord {
  seq: number;
  record: HouseholdRecord;
  updatedBy?: string | null;
}

export function householdOperationId({ kind, id }: RecordIdentity): string {
  return `${kind}|${id}`;
}

export function latestHouseholdRecords(rows: readonly SequencedHouseholdRecord[]): SequencedHouseholdRecord[] {
  const latest = new Map<string, SequencedHouseholdRecord>();
  for (const row of rows) {
    const id = householdOperationId(row.record);
    const previous = latest.get(id);
    if (!previous || row.seq > previous.seq) latest.set(id, row);
  }
  return [...latest.values()].sort((a, b) => a.seq - b.seq);
}

interface HouseholdRecordScope {
  householdId: string;
  recordId: string;
  keyVersion: number;
}

export interface EncryptedHouseholdRecord {
  record_id: string;
  key_version: number;
  iv: string;
  ciphertext: string;
  deleted: boolean;
}

export async function derivedRecordId(householdId: string, key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${householdId}|${key}`));
  const bytes = new Uint8Array(digest, 0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export function householdRecordId(householdId: string, kind: HouseholdRecordKind, engineId: string): Promise<string> {
  return derivedRecordId(householdId, `${kind}|${engineId}`);
}

function additionalData(householdId: string, recordId: string, keyVersion: number) {
  return encoder.encode(`${householdId}|${recordId}|${keyVersion}`);
}

export async function encryptHouseholdRecord(
  key: CryptoKey, scope: HouseholdRecordScope, record: HouseholdRecord,
): Promise<EncryptedHouseholdRecord> {
  const { householdId, recordId, keyVersion } = scope;
  const { kind, id, data, balanceEffect } = record;
  const payload = data === undefined ? { kind, id } : { kind, id, data, balanceEffect };
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(householdId, recordId, keyVersion) },
    key,
    encoder.encode(JSON.stringify(payload)),
  );
  return {
    record_id: recordId,
    key_version: keyVersion,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
    deleted: data === undefined,
  };
}

export async function decryptHouseholdRecord(
  key: CryptoKey, householdId: string, encrypted: EncryptedHouseholdRecord,
): Promise<HouseholdRecord> {
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: fromBase64(encrypted.iv),
    additionalData: additionalData(householdId, encrypted.record_id, encrypted.key_version),
  }, key, fromBase64(encrypted.ciphertext));
  const record = JSON.parse(decoder.decode(plaintext));
  if (!record || typeof record.id !== 'string' || !kinds.includes(record.kind) ||
      Object.hasOwn(record, 'data') === encrypted.deleted) {
    throw new Error('Cet élément du foyer est illisible.');
  }
  const { kind, id, data, balanceEffect } = record;
  if (balanceEffect !== undefined && (!balanceEffect || typeof balanceEffect.checkpointId !== 'string' ||
      !balanceEffect.checkpointId || !Number.isSafeInteger(balanceEffect.deltaCents) || encrypted.deleted)) {
    throw new Error('Cet élément du foyer est illisible.');
  }
  return encrypted.deleted ? { kind, id } : { kind, id, data, ...(balanceEffect && { balanceEffect }) };
}
