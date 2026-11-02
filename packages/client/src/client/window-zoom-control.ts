import { WindowZoom, ZoomError } from './window-zoom.js';
const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function mountWindowZoomControl(owner: WindowZoom): () => void {
  const abort = new AbortController();
  let lease: { clientId: string; token: string } | undefined;
  const path = './api/botharness/window-zoom-control';
  const post = async (body: Record<string, unknown>) => {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      signal: abort.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const value = object(await response.json());
    if (!response.ok)
      throw new ZoomError(String(object(value.error).code ?? 'zoom-control-unavailable'));
    return value;
  };
  const run = async () => {
    while (!abort.signal.aborted) {
      try {
        const registration = await post({ action: 'register' });
        if (typeof registration.clientId !== 'string' || typeof registration.token !== 'string')
          throw new ZoomError('zoom-invalid-registration');
        lease = { clientId: registration.clientId, token: registration.token };
        while (!abort.signal.aborted) {
          const { delivery: raw } = await post({ action: 'poll', ...lease });
          if (raw === null) continue;
          const delivery = object(raw);
          let result: unknown;
          try {
            if (typeof delivery.expiresAt !== 'number' || Date.now() >= delivery.expiresAt)
              throw new ZoomError('zoom-request-stale');
            if (delivery.operation !== undefined && typeof delivery.expectedRevision !== 'string')
              throw new ZoomError('zoom-revision-required');
            if (delivery.operation === undefined) owner.refresh();
            const snapshot =
              delivery.operation === undefined
                ? owner.getSnapshot()
                : owner.execute(delivery.operation, delivery.expectedRevision as string);
            if (snapshot.error) throw new ZoomError(snapshot.error);
            result = { snapshot };
          } catch (error) {
            result = {
              error: { code: error instanceof ZoomError ? error.code : 'zoom-client-failed' },
            };
          }
          await post({ action: 'reply', ...lease, requestId: delivery.id, result });
        }
      } catch {
        if (!abort.signal.aborted)
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer);
              abort.signal.removeEventListener('abort', done);
              resolve();
            };
            const timer = setTimeout(done, 3000);
            abort.signal.addEventListener('abort', done, { once: true });
          });
      }
    }
  };
  void run();
  return () => {
    abort.abort();
    if (lease)
      void fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'unregister', ...lease }),
      }).catch(() => {});
  };
}
