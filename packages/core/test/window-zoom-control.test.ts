import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWindowZoomControl } from '../src/window-zoom/control.js';
const request = (value: unknown, signal?: AbortSignal) =>
  new Request('http://localhost/api/botharness/window-zoom-control', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
    ...(signal ? { signal } : {}),
  });
afterEach(() => vi.useRealTimers());
describe('explicit Client zoom delivery', () => {
  it('delivers to only the selected waiting Client and requires its token for replies', async () => {
    const log = vi.fn();
    const c = createWindowZoomControl(Date.now, log);
    const a = await (await c.fetch(request({ action: 'register' }))).json();
    const b = await (await c.fetch(request({ action: 'register' }))).json();
    const pollA = c.fetch(request({ action: 'poll', ...a }));
    const pollB = c.fetch(request({ action: 'poll', ...b }));
    const result = c.fetch(request({ action: 'request', clientId: b.clientId }));
    const { delivery } = await (await pollB).json();
    expect(
      (
        await c.fetch(
          request({
            action: 'reply',
            ...b,
            token: a.token,
            requestId: delivery.id,
            result: { snapshot: {} },
          }),
        )
      ).status,
    ).toBe(403);
    await c.fetch(
      request({
        action: 'reply',
        ...b,
        requestId: delivery.id,
        result: { snapshot: { level: 1 } },
      }),
    );
    expect(await (await result).json()).toEqual({ snapshot: { level: 1 } });
    const listed = await (await c.fetch(new Request('http://localhost'))).json();
    expect(JSON.stringify(listed)).not.toContain(a.token);
    expect(JSON.stringify(log.mock.calls)).not.toContain(a.token);
    expect(JSON.stringify(log.mock.calls)).not.toContain(b.token);
    expect(log).toHaveBeenCalledWith(
      'settled',
      expect.objectContaining({ status: 200, code: 'completed' }),
    );
    c.dispose();
    expect(await (await pollA).json()).toEqual({ delivery: null });
  });
  it('refuses an absent target, offline writes and unreviewed revisions', async () => {
    const c = createWindowZoomControl();
    expect((await c.fetch(request({ action: 'request' }))).status).toBe(400);
    const lease = await (await c.fetch(request({ action: 'register' }))).json();
    expect(
      await (
        await c.fetch(
          request({ action: 'request', clientId: lease.clientId, operation: { type: 'reset' } }),
        )
      ).json(),
    ).toMatchObject({ error: { code: 'zoom-revision-required' } });
    expect(
      await (
        await c.fetch(
          request({
            action: 'request',
            clientId: lease.clientId,
            operation: { type: 'reset' },
            expectedRevision: 'r',
          }),
        )
      ).json(),
    ).toMatchObject({ error: { code: 'zoom-client-unavailable' } });
    c.dispose();
  });
  it('expires delivery, rejects late acknowledgement and never queues an offline mutation', async () => {
    vi.useFakeTimers();
    const c = createWindowZoomControl();
    const lease = await (await c.fetch(request({ action: 'register' }))).json();
    const poll = c.fetch(request({ action: 'poll', ...lease }));

    await vi.advanceTimersByTimeAsync(0);
    const result = c.fetch(
      request({
        action: 'request',
        clientId: lease.clientId,
        operation: { type: 'reset' },
        expectedRevision: 'r',
      }),
    );
    const { delivery } = await (await poll).json();
    await vi.advanceTimersByTimeAsync(8000);
    expect(await (await result).json()).toMatchObject({ error: { code: 'zoom-client-timeout' } });
    expect(
      await (
        await c.fetch(
          request({ action: 'reply', ...lease, requestId: delivery.id, result: { snapshot: {} } }),
        )
      ).json(),
    ).toMatchObject({ error: { code: 'zoom-request-stale' } });
    c.dispose();
  });
  it('cancels a disconnected poll without delivering later', async () => {
    const c = createWindowZoomControl();
    const lease = await (await c.fetch(request({ action: 'register' }))).json();
    const abort = new AbortController();
    const poll = c.fetch(request({ action: 'poll', ...lease }, abort.signal));
    abort.abort();
    await poll;
    expect(
      await (await c.fetch(request({ action: 'request', clientId: lease.clientId }))).json(),
    ).toMatchObject({ error: { code: 'zoom-client-unavailable' } });
    c.dispose();
  });
});
