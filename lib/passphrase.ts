const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generatePassphrase(random = (bytes: Uint8Array<ArrayBuffer>) => crypto.getRandomValues(bytes)): string {
  const bytes = new Uint8Array(24);
  const groups: string[] = [];
  let group = '';
  while (groups.length < 4) {
    for (const byte of random(bytes)) {
      if (byte >= 248) continue;
      group += alphabet[byte % alphabet.length];
      if (group.length === 5) {
        groups.push(group);
        group = '';
        if (groups.length === 4) break;
      }
    }
  }
  return groups.join('-');
}
