import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'private, no-store' };

function unavailable() {
  return Response.json({ error: 'La récupération du budget est temporairement indisponible.' }, { status: 503, headers });
}

function unauthorized() {
  return Response.json({ error: 'Connecte-toi pour récupérer ton budget.' }, { status: 401, headers });
}

export async function POST(request: Request) {
  const token = /^Bearer ([^\s,]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return unauthorized();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const encodedRoot = process.env.BUDGET_VAULT_MANAGED_KEY_V1 ?? '';
  const root = Buffer.from(encodedRoot, 'base64');
  if (!url || !publishableKey || root.length !== 32 || root.toString('base64') !== encodedRoot) return unavailable();

  try {
    const client = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error) return error.status === 400 || error.status === 401 || error.status === 403 ? unauthorized() : unavailable();
    if (!data.user?.id) return unauthorized();

    const material = createHmac('sha256', root).update('capiste-budget-vault:v1:').update(data.user.id).digest('base64');
    return Response.json({ material, version: 1 }, { headers });
  } catch {
    return unavailable();
  }
}
