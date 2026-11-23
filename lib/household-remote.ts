import { createClient } from '@supabase/supabase-js';
import { readStoredSessionUserId } from './account-guard.ts';
import { cloudClient } from './cloud-remote.ts';
import { householdCopy } from './household-copy.ts';
import type { HouseholdListing } from './household-storage.ts';
import type { HouseholdRemote } from './household-sync.ts';

export function assertHouseholdAccount(userId: string) {
  if (readStoredSessionUserId(localStorage) !== userId) throw new Error(householdCopy.accountChanged);
}

export class HouseholdAccessRevoked extends Error {
  constructor() { super(householdCopy.revoked); }
}

interface HouseholdMembershipRow {
  household_id: string;
  key_version: number;
  created_at: string;
  member_id: string;
  active_member_ids: string[];
}

async function authorizedClient(userId: string) {
  assertHouseholdAccount(userId);
  const { data, error } = await cloudClient().auth.getSession();
  if (error || data.session?.user.id !== userId) throw new Error(householdCopy.accountChanged);
  assertHouseholdAccount(userId);
  const accessToken = data.session.access_token;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    accessToken: () => Promise.resolve(accessToken),
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}

async function checkedClient(userId: string) {
  const client = await authorizedClient(userId);
  const version = await client.rpc('household_sync_version');
  assertHouseholdAccount(userId);
  if (version.error || version.data !== 2) throw new Error(householdCopy.notReady);
  return client;
}

export async function listHouseholds(userId: string): Promise<HouseholdListing[]> {
  const client = await checkedClient(userId);
  const { data, error } = await client.rpc('list_my_households');
  assertHouseholdAccount(userId);
  if (error) throw new Error(householdCopy.unavailable);
  return data.map((row: HouseholdMembershipRow) => ({
    id: row.household_id, keyVersion: row.key_version, createdAt: row.created_at, memberId: row.member_id,
    activeMemberIds: row.active_member_ids,
  }));
}

export async function createHousehold(userId: string): Promise<string> {
  const client = await checkedClient(userId);
  const { data, error } = await client.rpc('create_household');
  assertHouseholdAccount(userId);
  const id = data?.[0]?.household_id;
  if (error || typeof id !== 'string') throw new Error(householdCopy.unavailable);
  return id;
}

export async function householdRemote(userId: string, householdId: string): Promise<HouseholdRemote> {
  const client = await checkedClient(userId);
  return {
    async push(records) {
      assertHouseholdAccount(userId);
      const capability = await client.from('household_records').select('exclusive,author_member_id,editor_member_id').eq('household_id', householdId).limit(0);
      assertHouseholdAccount(userId);
      if (capability.error) throw new Error(householdCopy.notReady);
      const { data, error } = await client.rpc('upsert_records', { h: householdId, records });
      assertHouseholdAccount(userId);
      if (error?.code === '42501') throw new HouseholdAccessRevoked();
      if (error) throw new Error(householdCopy.unavailable);
      return data;
    },
    async pull(after) {
      assertHouseholdAccount(userId);
      const { data, error } = await client.rpc('pull_records', { h: householdId, after_seq: after });
      assertHouseholdAccount(userId);
      if (error?.code === '42501') throw new HouseholdAccessRevoked();
      if (error) throw new Error(householdCopy.unavailable);
      return data;
    },
  };
}
