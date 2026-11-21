import { emptyBudgetState, serializeBudget } from './budget-state.ts';

export const ACCOUNT_OWNER_KEY = 'boussole-budget-owner-v1';
export const ACCOUNT_TRANSITION_LOCK = 'boussole-account-transition';
export const AUTH_STORAGE_KEY = 'boussole-auth';

export type BudgetOwner =
  | { type: 'guest' }
  | { type: 'account' | 'transition'; userId: string };

export type OwnerStatus = BudgetOwner | { type: 'unreadable' };
export type SessionUserId = string | null | undefined;

const guest = { type: 'guest' } as const;
const unreadable = { type: 'unreadable' } as const;
const pristine = serializeBudget(emptyBudgetState);

function nonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function readBudgetOwner(storage: Pick<Storage, 'getItem'>): OwnerStatus {
  try {
    const raw = storage.getItem(ACCOUNT_OWNER_KEY);
    if (raw === null) return guest;
    const record = JSON.parse(raw);
    if (record?.type === 'guest') return guest;
    if ((record?.type === 'account' || record?.type === 'transition') && nonEmptyId(record.userId)) {
      return { type: record.type, userId: record.userId };
    }
    return unreadable;
  } catch {
    return unreadable;
  }
}

export function readStoredSessionUserId(storage: Pick<Storage, 'getItem'>): SessionUserId {
  try {
    const raw = storage.getItem(AUTH_STORAGE_KEY);
    if (raw === null) return null;
    const session = JSON.parse(raw);
    return nonEmptyId(session?.access_token) && nonEmptyId(session.user?.id) ? session.user.id : undefined;
  } catch {
    return undefined;
  }
}

export function readExpiredSession(storage: Pick<Storage, 'getItem'>, now = Date.now() / 1000) {
  try {
    const session = JSON.parse(storage.getItem(AUTH_STORAGE_KEY) ?? 'null');
    if (nonEmptyId(session?.access_token) && nonEmptyId(session.refresh_token) && nonEmptyId(session.user?.id)
      && Number.isFinite(session.expires_at) && session.expires_at <= now) {
      return { userId: session.user.id, email: typeof session.user.email === 'string' ? session.user.email : '' };
    }
  } catch {
    // Une session illisible ne peut pas autoriser l’accès hors ligne.
  }
  return null;
}

export function accountGuard({ sessionUserId, keyUserId, owner }: {
  sessionUserId: SessionUserId;
  keyUserId: string | null;
  owner: OwnerStatus;
}): boolean {
  if (owner.type === 'guest') return sessionUserId === null && keyUserId === null;
  return owner.type === 'account' && sessionUserId === owner.userId && keyUserId === owner.userId;
}

export function isPristineBudget(serialized: string, legacy: string | null): boolean {
  return legacy === null && serialized === pristine;
}
