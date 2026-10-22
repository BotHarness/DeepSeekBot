import { randomUUID } from 'node:crypto';

export const APPEARANCE_CONTROL_PATH = '/api/botharness/appearance-control';
interface Command {
  id: string;
  expiresAt: number;
  patch?: unknown;
  wallpaper?: unknown;
  recovery?: unknown;
  notifications?: unknown;
  hostLook?: unknown;
  expectedRevision?: string;
}
interface Client {
  id: string;
  token: string;
  platform: 'web' | 'desktop';
  seen: number;
  poll?: (command: Command | null) => void;
  pending?: { command: Command; resolve: (response: Response) => void };
}
const json = (value: unknown, status = 200) => Response.json(value, { status });
const refused = (code: string, status = 409) => json({ error: { code, message: code } }, status);
const record = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
export function createAppearanceControl(now = Date.now) {
  const clients = new Map<string, Client>();
  const remove = (client: Client) => {
    client.poll?.(null);
    client.pending?.resolve(refused('appearance-client-stale'));
    clients.delete(client.id);
  };
  return {
    dispose: () => {
      for (const client of clients.values()) remove(client);
    },
    async fetch(request: Request): Promise<Response> {
      for (const client of clients.values()) if (now() - client.seen >= 30000) remove(client);
      if (request.method === 'GET')
        return json({
          clients: [...clients.values()].map(({ id, platform }) => ({ id, platform })),
        });
      const raw = await request.text();
      if (raw.length > 270000) return refused('appearance-invalid-input', 400);
      let input: Record<string, unknown>;
      try {
        input = record(JSON.parse(raw));
      } catch {
        return refused('appearance-invalid-input', 400);
      }
      if (
        raw.length > 4096 &&
        !(input.action === 'request' && record(input.wallpaper).action === 'append')
      )
        return refused('appearance-invalid-input', 400);
      if (input.action === 'register') {
        if (clients.size >= 32) return refused('appearance-client-limit');
        if (input.platform !== 'web' && input.platform !== 'desktop')
          return refused('appearance-invalid-input', 400);
        const client: Client = {
          id: randomUUID(),
          token: randomUUID(),
          platform: input.platform,
          seen: now(),
        };
        clients.set(client.id, client);
        return json({ clientId: client.id, token: client.token });
      }
      if (typeof input.clientId !== 'string') return refused('appearance-client-required', 400);
      const client = clients.get(input.clientId);
      if (!client) return refused('appearance-client-stale', 404);
      if (input.action === 'request') {
        if (
          [input.patch, input.wallpaper, input.recovery, input.notifications, input.hostLook].filter(
            (v) => v !== undefined,
          ).length > 1
        )
          return refused('appearance-invalid-input', 400);
        if (input.patch !== undefined && typeof input.expectedRevision !== 'string')
          return refused('appearance-revision-required', 400);
        if (client.pending) return refused('appearance-client-busy');
        if (!client.poll) return refused('appearance-client-unavailable');
        const command: Command = {
          id: randomUUID(),
          expiresAt: now() + 8000,
          ...(input.hostLook === undefined ? {} : { hostLook: input.hostLook, expectedRevision: input.expectedRevision as string }),
          ...(input.notifications === undefined
            ? {}
            : {
                notifications: input.notifications,
                expectedRevision: input.expectedRevision as string,
              }),
          ...(input.recovery === undefined
            ? {}
            : { recovery: input.recovery, expectedRevision: input.expectedRevision as string }),
          ...(input.wallpaper === undefined
            ? {}
            : { wallpaper: input.wallpaper, expectedRevision: input.expectedRevision as string }),
          ...(input.patch === undefined
            ? {}
            : { patch: input.patch, expectedRevision: input.expectedRevision as string }),
        };
        return new Promise<Response>((resolve) => {
          const timer = setTimeout(() => {
            if (client.pending?.command === command) delete client.pending;
            resolve(refused('appearance-client-timeout'));
          }, 8000);
          client.pending = {
            command,
            resolve: (response) => {
              clearTimeout(timer);
              resolve(response);
            },
          };
          client.poll!(command);
        });
      }
      if (input.token !== client.token) return refused('appearance-client-token-invalid', 403);
      client.seen = now();
      if (input.action === 'unregister') {
        remove(client);
        return json({ ok: true });
      }
      if (input.action === 'reply') {
        if (
          !client.pending ||
          client.pending.command.id !== input.requestId ||
          now() > client.pending.command.expiresAt
        )
          return refused('appearance-request-stale');
        const result = record(input.result);
        const code = record(result.error).code;
        client.pending.resolve(typeof code === 'string' ? refused(code) : json(result));
        delete client.pending;
        return json({ ok: true });
      }
      if (input.action !== 'poll') return refused('appearance-invalid-input', 400);
      if (client.poll) return refused('appearance-client-busy');
      return new Promise<Response>((resolve) => {
        const finish = (command: Command | null) => {
          clearTimeout(timer);
          request.signal.removeEventListener('abort', abort);
          delete client.poll;
          resolve(json({ command }));
        };
        const abort = () => finish(null);
        const timer = setTimeout(() => finish(null), 15000);
        client.poll = finish;
        request.signal.addEventListener('abort', abort, { once: true });
        if (request.signal.aborted) finish(null);
      });
    },
  };
}
