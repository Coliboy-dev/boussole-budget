import { randomBytes, toBase64 } from './cloud-crypto.ts';

export async function createInvitationToken(): Promise<{ token: string; tokenHash: string }> {
  const token = toBase64(randomBytes(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { token, tokenHash };
}

export function buildInvitationLink(origin: string, invitationId: string, token: string): string {
  const url = new URL('/foyer/rejoindre', origin);
  url.hash = new URLSearchParams({ i: invitationId, t: token }).toString();
  return url.href;
}

const invitationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invitationTokenPattern = /^[A-Za-z0-9_-]{43}$/;

/** Lit « #i=<invitation>&t=<jeton> ». Le fragment ne quitte pas le navigateur ; un lien tronqué est refusé. */
export function parseInvitationHash(hash: string): { invitationId: string; token: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const invitationId = params.get('i') ?? '';
  const token = params.get('t') ?? '';
  return invitationIdPattern.test(invitationId) && invitationTokenPattern.test(token) ? { invitationId, token } : null;
}
