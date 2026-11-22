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
