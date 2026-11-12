export const PRESENCE_PATH = '/api/botharness/presence';
export const PRESENCE_LEASE_MS = 90_000;
const MAX_CLIENTS = 64;
const CLIENT_ID = /^[A-Za-z0-9_-]{1,128}$/u;

const refusal = (code: string, status = 400) =>
  Response.json({ error: { code, message: code } }, { status });

export interface Presence {
  active(): boolean;
  report(clientId: string, active: boolean): boolean;
  status(): { active: boolean; clients: number; leaseMs: number };
  subscribe(listener: () => void): () => void;
  fetch(request: Request): Promise<Response>;
  dispose(): void;
}

export function createPresence(now: () => number = Date.now): Presence {
  const clients = new Map<string, number>();
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = false;
  const prune = () => {
    const at = now();
    for (const [id, expiresAt] of clients) if (expiresAt <= at) clients.delete(id);
  };
  const settle = () => {
    prune();
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (clients.size > 0) {
      const next = Math.min(...clients.values());
      timer = setTimeout(settle, Math.max(0, next - now()) + 1);
      timer.unref?.();
    }
    const active = clients.size > 0;
    if (active === last) return;
    last = active;
    for (const listener of listeners) listener();
  };
  const status = () => {
    prune();
    return {
      active: clients.size > 0,
      clients: clients.size,
      leaseMs: PRESENCE_LEASE_MS,
    };
  };
  const report = (clientId: string, active: boolean): boolean => {
    if (!CLIENT_ID.test(clientId)) return false;
    prune();
    if (active) {
      if (!clients.has(clientId) && clients.size >= MAX_CLIENTS) return false;
      clients.set(clientId, now() + PRESENCE_LEASE_MS);
    } else clients.delete(clientId);
    settle();
    return true;
  };
  return {
    active: () => status().active,
    report,
    status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async fetch(request) {
      if (request.method === 'GET') return Response.json(status());
      if (request.method !== 'POST') return refusal('presence-method-not-allowed', 405);
      let input: unknown;
      try {
        const text = await request.text();
        if (text.length > 1024) return refusal('presence-invalid-input');
        input = JSON.parse(text);
      } catch {
        return refusal('presence-invalid-input');
      }
      const body =
        typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
      if (typeof body['clientId'] !== 'string' || typeof body['active'] !== 'boolean')
        return refusal('presence-invalid-input');
      if (!report(body['clientId'], body['active']))
        return refusal(
          CLIENT_ID.test(body['clientId']) ? 'presence-client-limit' : 'presence-invalid-input',
          CLIENT_ID.test(body['clientId']) ? 409 : 400,
        );
      return Response.json(status());
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      clients.clear();
      listeners.clear();
    },
  };
}
