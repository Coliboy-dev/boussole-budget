// Messages de sécurité entre les onglets d’un même navigateur.
// BroadcastChannel en priorité, événement `storage` en repli.

export const SECURITY_EVENT_KEY = 'boussole-security-event';
const CHANNEL = 'boussole-security';

export type SecurityEventType = 'locked' | 'local-erased' | 'lock-settings-changed';

interface SecurityMessage {
  type: SecurityEventType;
  at: number;
  source: string;
}

const tabId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random()}`;

function isMessage(value: unknown): value is SecurityMessage {
  return Boolean(value) && typeof value === 'object'
    && typeof (value as SecurityMessage).type === 'string' && typeof (value as SecurityMessage).source === 'string';
}

export function postSecurityEvent(type: SecurityEventType): void {
  const message: SecurityMessage = { type, at: Date.now(), source: tabId };
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // Navigateur sans BroadcastChannel : le repli ci-dessous suffit.
  }
  try {
    localStorage.setItem(SECURITY_EVENT_KEY, JSON.stringify(message));
  } catch {
    // Stockage indisponible.
  }
}

/** Appelle `listener` pour chaque message venu d’un autre onglet, une seule fois par message. */
export function subscribeSecurityEvents(listener: (type: SecurityEventType) => void): () => void {
  const seen = new Set<string>();
  const handle = (value: unknown) => {
    if (!isMessage(value) || value.source === tabId) return;
    const id = `${value.source}:${value.at}:${value.type}`;
    if (seen.has(id)) return;
    seen.add(id);
    listener(value.type);
  };

  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => handle(event.data);
  } catch {
    channel = undefined;
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SECURITY_EVENT_KEY || !event.newValue) return;
    try {
      handle(JSON.parse(event.newValue));
    } catch {
      // Message illisible : ignoré.
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
