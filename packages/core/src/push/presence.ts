import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
export const PRESENCE_PATH = '/api/botharness/presence';
export const PRESENCE_LEASE_MS = 90_000;
const MAX_CLIENTS = 64;
const CLIENT_ID = /^[A-Za-z0-9_-]{1,128}$/u;

const refusal = (code: string, status = 400) =>
  Response.json({ error: { code, message: code } }, { status });

export interface Presence {
  active(human?: HumanContext): boolean;
  report(clientId: string, active: boolean, human?: HumanContext): boolean;
  status(human?: HumanContext): { active: boolean; clients: number; leaseMs: number };
  subscribe(listener: () => void): () => void;
  fetch(request: Request, human?: HumanContext): Promise<Response>;
  dispose(): void;
}

export function createPresence(now: () => number = Date.now): Presence {
  const clients = new Map<string, { humanId: string; expiresAt: number }>();
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = '[]';
  const prune = () => {
    const at = now();
    for (const [id, client] of clients) if (client.expiresAt <= at) clients.delete(id);
  };
  const settle = () => {
    prune();
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (clients.size > 0) {
      const next = Math.min(...[...clients.values()].map((client) => client.expiresAt));
      timer = setTimeout(settle, Math.max(0, next - now()) + 1);
      timer.unref?.();
    }
    const active = JSON.stringify(
      [...new Set([...clients.values()].map((client) => client.humanId))].sort(),
    );
    if (active === last) return;
    last = active;
    for (const listener of listeners) listener();
  };
  const status = (human: HumanContext = OWNER_HUMAN_CONTEXT) => {
    prune();
    const count = [...clients.values()].filter((client) => client.humanId === human.humanId).length;
    return {
      active: count > 0,
      clients: count,
      leaseMs: PRESENCE_LEASE_MS,
    };
  };
  const report = (
    clientId: string,
    active: boolean,
    human: HumanContext = OWNER_HUMAN_CONTEXT,
  ): boolean => {
    if (!CLIENT_ID.test(clientId)) return false;
    prune();
    const key = JSON.stringify([human.humanId, clientId]);
    if (active) {
      if (!clients.has(key) && clients.size >= MAX_CLIENTS) return false;
      clients.set(key, { humanId: human.humanId, expiresAt: now() + PRESENCE_LEASE_MS });
    } else clients.delete(key);
    settle();
    return true;
  };
  return {
    active: (human) => status(human).active,
    report,
    status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async fetch(request, human = OWNER_HUMAN_CONTEXT) {
      if (request.method === 'GET') return Response.json(status(human));
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
      if (!report(body['clientId'], body['active'], human))
        return refusal(
          CLIENT_ID.test(body['clientId']) ? 'presence-client-limit' : 'presence-invalid-input',
          CLIENT_ID.test(body['clientId']) ? 409 : 400,
        );
      return Response.json(status(human));
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      clients.clear();
      listeners.clear();
    },
  };
}
