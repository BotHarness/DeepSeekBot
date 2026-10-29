import { randomUUID } from 'node:crypto';

export const WINDOW_ZOOM_CONTROL_PATH = '/api/botharness/window-zoom-control';
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const refusal = (code: string, status = 409) =>
  Response.json({ error: { code, message: code } }, { status });
interface Delivery {
  id: string;
  expiresAt: number;
  operation?: unknown;
  expectedRevision?: string;
}
interface Client {
  id: string;
  token: string;
  seen: number;
  poll?: (delivery: Delivery | null) => void;
  pending?: { delivery: Delivery; finish(response: Response, code?: string): void };
}

export function createWindowZoomControl(
  now: () => number = Date.now,
  log: (phase: string, detail: Record<string, string | number>) => void = () => {},
) {
  const record = (phase: string, detail: Record<string, string | number>) => {
    try {
      log(phase, detail);
    } catch {}
  };
  const clients = new Map<string, Client>();
  let disposed = false;
  const drop = (client: Client) => {
    client.poll?.(null);
    client.pending?.finish(refusal('zoom-client-stale'), 'zoom-client-stale');
    record('disconnected', { clientId: client.id });
    clients.delete(client.id);
  };
  return {
    dispose() {
      disposed = true;
      for (const client of clients.values()) drop(client);
    },
    async fetch(request: Request): Promise<Response> {
      if (disposed) return refusal('zoom-control-unavailable', 503);
      for (const client of clients.values()) if (now() - client.seen >= 30_000) drop(client);
      if (request.method === 'GET')
        return Response.json({
          clients: [...clients.values()].map((client) => ({
            id: client.id,
            runtime: 'desktop',
            window: 'primary',
            connected: !!client.poll,
          })),
        });
      if (request.method !== 'POST') return refusal('zoom-method-not-allowed', 405);
      let input: Record<string, unknown>;
      try {
        const text = await request.text();
        if (text.length > 8192) return refusal('zoom-invalid-input', 400);
        input = object(JSON.parse(text));
      } catch {
        return refusal('zoom-invalid-input', 400);
      }
      if (input.action === 'register') {
        if (clients.size >= 32) return refusal('zoom-client-limit');
        const client: Client = { id: randomUUID(), token: randomUUID(), seen: now() };
        clients.set(client.id, client);
        record('registered', { clientId: client.id });
        return Response.json({ clientId: client.id, token: client.token });
      }
      if (typeof input.clientId !== 'string') return refusal('zoom-client-required', 400);
      const client = clients.get(input.clientId);
      if (!client) return refusal('zoom-client-stale', 404);
      if (input.action === 'request') {
        if (input.operation !== undefined && typeof input.expectedRevision !== 'string')
          return refusal('zoom-revision-required', 400);
        if (client.pending) return refusal('zoom-client-busy');
        if (!client.poll) return refusal('zoom-client-unavailable');
        if (request.signal.aborted) return refusal('zoom-request-cancelled');
        const delivery: Delivery = {
          id: randomUUID(),
          expiresAt: now() + 8000,
          ...(input.operation === undefined
            ? {}
            : { operation: input.operation, expectedRevision: input.expectedRevision as string }),
        };
        return new Promise((resolve) => {
          let settled = false;
          const startedAt = now();
          const finish = (response: Response, code = 'completed') => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            request.signal.removeEventListener('abort', cancelled);
            if (client.pending?.delivery === delivery) delete client.pending;
            record('settled', {
              clientId: client.id,
              requestId: delivery.id,
              status: response.status,
              durationMs: Math.max(0, now() - startedAt),
              code:
                /^zoom-[a-z-]{1,64}$/.test(code) || code === 'completed'
                  ? code
                  : 'zoom-client-failed',
            });
            resolve(response);
          };

          const cancelled = () =>
            finish(refusal('zoom-request-cancelled'), 'zoom-request-cancelled');
          const timer = setTimeout(
            () => finish(refusal('zoom-client-timeout'), 'zoom-client-timeout'),
            8000,
          );
          client.pending = { delivery, finish };
          request.signal.addEventListener('abort', cancelled, { once: true });
          record('delivered', {
            clientId: client.id,
            requestId: delivery.id,
            initiator: 'explicit-client-request',
            operation: delivery.operation === undefined ? 'read' : 'write',
          });
          client.poll!(delivery);
        });
      }
      if (input.token !== client.token) return refusal('zoom-client-token-invalid', 403);
      client.seen = now();
      if (input.action === 'unregister') {
        drop(client);
        return Response.json({ ok: true });
      }
      if (input.action === 'reply') {
        if (
          !client.pending ||
          client.pending.delivery.id !== input.requestId ||
          now() >= client.pending.delivery.expiresAt
        )
          return refusal('zoom-request-stale');
        const result = object(input.result);
        const error = object(result.error).code;
        if (typeof error !== 'string' && !('snapshot' in result))
          return refusal('zoom-invalid-reply', 400);
        client.pending.finish(
          typeof error === 'string' ? refusal(error) : Response.json({ snapshot: result.snapshot }),
          typeof error === 'string' ? error : 'completed',
        );
        return Response.json({ ok: true });
      }
      if (input.action !== 'poll') return refusal('zoom-invalid-input', 400);
      if (client.poll) return refusal('zoom-client-busy');
      return new Promise((resolve) => {
        let settled = false;
        const finish = (delivery: Delivery | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          request.signal.removeEventListener('abort', cancelled);
          delete client.poll;
          resolve(Response.json({ delivery }));
        };
        const cancelled = () => finish(null);
        const timer = setTimeout(() => finish(null), 15000);
        client.poll = finish;
        request.signal.addEventListener('abort', cancelled, { once: true });
        if (request.signal.aborted) cancelled();
      });
    },
  };
}
