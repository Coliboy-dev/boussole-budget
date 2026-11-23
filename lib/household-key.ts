import type { SupabaseClient } from '@supabase/supabase-js';
import { fromBase64, toBase64 } from './cloud-crypto.ts';

export interface HouseholdKey {
  userId: string;
  householdId: string;
  keyVersion: number;
  key: CryptoKey;
}

export async function fetchHouseholdKey(
  auth: Pick<SupabaseClient['auth'], 'getSession'>,
  userId: string,
  householdId: string,
): Promise<HouseholdKey> {
  const { data, error } = await auth.getSession();
  if (error || data.session?.user.id !== userId) {
    throw new Error('Reconnecte-toi pour ouvrir ton foyer.');
  }

  const failure = 'La clé du foyer est temporairement indisponible.';
  try {
    const response = await fetch('/api/household-key', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ householdId }),
    });
    if (!response.ok) throw new Error(failure);
    const { material, version } = await response.json();
    if (typeof material !== 'string' || version !== 1) throw new Error(failure);
    const bytes = fromBase64(material);
    if (bytes.length !== 32 || toBase64(bytes) !== material) throw new Error(failure);

    const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return { userId, householdId, keyVersion: version, key };
  } catch {
    throw new Error(failure);
  }
}
