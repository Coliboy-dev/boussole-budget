import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'private, no-store' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = () => Response.json(
  { error: 'La clé du foyer est temporairement indisponible.' }, { status: 503, headers },
);
const unauthorized = () => Response.json(
  { error: 'Connecte-toi pour ouvrir ton foyer.' }, { status: 401, headers },
);

export async function POST(request: Request) {
  const token = /^Bearer ([^\s,]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return unauthorized();

  const body = await request.json().catch(() => null);
  if (typeof body?.householdId !== 'string' || !uuid.test(body.householdId)) {
    return Response.json({ error: 'Le foyer demandé est invalide.' }, { status: 400, headers });
  }
  const householdId = body.householdId.toLowerCase();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const encodedRoot = process.env.BUDGET_VAULT_MANAGED_KEY_V1 ?? '';
  const root = Buffer.from(encodedRoot, 'base64');
  if (!url || !publishableKey || root.length !== 32 || root.toString('base64') !== encodedRoot) return unavailable();

  try {
    const client = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    });
    const { data: identity, error: authError } = await client.auth.getUser(token);
    if (authError) return [400, 401, 403].includes(authError.status ?? 0) ? unauthorized() : unavailable();
    if (!identity.user?.id) return unauthorized();

    // Supabase applique la RLS du foyer avec le même jeton que celui validé par Auth.
    const { data: household, error } = await client
      .from('households').select('id,key_version').eq('id', householdId).maybeSingle();
    if (error) return unavailable();
    if (!household) return Response.json({ error: 'Ce foyer est indisponible.' }, { status: 403, headers });
    if (household.id !== householdId || household.key_version !== 1) return unavailable();

    const material = createHmac('sha256', root).update('capiste-household-vault:v1:').update(household.id).digest('base64');
    return Response.json({ material, version: 1 }, { headers });
  } catch {
    return unavailable();
  }
}
