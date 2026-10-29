import { afterEach, describe, it, expect, vi } from 'vitest';
import { createAppearanceControl } from '../src/appearance/control.js';
const request = (body: unknown) =>
  new Request('http://localhost/api/botharness/appearance-control', {
    method: 'POST',
    body: JSON.stringify(body),
  });
afterEach(() => vi.useRealTimers());
describe('explicit Client appearance delivery', () => {
  it('forwards notification choices only to the named Client without persisting them', async () => {
    const host = createAppearanceControl();
    const lease = await (await host.fetch(request({ action: 'register', platform: 'web' }))).json();
    const poll = host.fetch(request({ action: 'poll', ...lease }));
    await Promise.resolve();
    const notifications = { hostId: 'remote', patch: { enabled: false } };
    const response = host.fetch(
      request({
        action: 'request',
        clientId: lease.clientId,
        notifications,
        expectedRevision: 'before',
      }),
    );
    const { command } = await (await poll).json();
    expect(command).toMatchObject({ notifications, expectedRevision: 'before' });
    await host.fetch(
      request({
        action: 'reply',
        ...lease,
        requestId: command.id,
        result: { error: { code: 'notification-revision-stale' } },
      }),
    );
    expect((await response).status).toBe(409);
    host.dispose();
  });
  it('delivers only to the selected leased Client, relays storage refusal, and drops targets on disposal', async () => {
    const host = createAppearanceControl();
    const a = await (await host.fetch(request({ action: 'register', platform: 'web' }))).json();
    const b = await (await host.fetch(request({ action: 'register', platform: 'desktop' }))).json();
    const ap = host.fetch(request({ action: 'poll', ...a }));
    const bp = host.fetch(request({ action: 'poll', ...b }));
    await Promise.resolve();
    const result = host.fetch(
      request({
        action: 'request',
        clientId: a.clientId,
        patch: { preference: 'dark' },
        expectedRevision: 'initial',
      }),
    );
    const { command } = await (await ap).json();
    expect(command.patch).toEqual({ preference: 'dark' });
    await host.fetch(
      request({
        action: 'reply',
        ...a,
        requestId: command.id,
        result: { error: { code: 'appearance-storage-unavailable' } },
      }),
    );
    expect((await result).status).toBe(409);
    host.dispose();
    expect(await (await bp).json()).toEqual({ command: null });
    expect(await (await host.fetch(new Request('http://localhost'))).json()).toEqual({
      clients: [],
    });
  });
  it('refuses missing, stale, unavailable and wrong-token targets', async () => {
    const host = createAppearanceControl();
    expect((await host.fetch(request({ action: 'request' }))).status).toBe(400);
    expect((await host.fetch(request({ action: 'request', clientId: 'old' }))).status).toBe(404);
    const a = await (await host.fetch(request({ action: 'register', platform: 'web' }))).json();
    expect((await host.fetch(request({ action: 'request', clientId: a.clientId }))).status).toBe(
      409,
    );
    expect((await host.fetch(request({ action: 'poll', ...a, token: 'wrong' }))).status).toBe(403);
    expect(
      (
        await host.fetch(
          request({ action: 'request', clientId: a.clientId, patch: { preference: 'dark' } }),
        )
      ).status,
    ).toBe(400);
    host.dispose();
  });
  it('expires unacknowledged commands and rejects late replies without replaying', async () => {
    vi.useFakeTimers();
    const host = createAppearanceControl();
    const a = await (await host.fetch(request({ action: 'register', platform: 'web' }))).json();
    const poll = host.fetch(request({ action: 'poll', ...a }));
    await Promise.resolve();
    const result = host.fetch(request({ action: 'request', clientId: a.clientId }));
    const { command } = await (await poll).json();
    await vi.advanceTimersByTimeAsync(8001);
    expect((await (await result).json()).error.code).toBe('appearance-client-timeout');
    expect(
      (
        await host.fetch(
          request({ action: 'reply', ...a, requestId: command.id, result: { snapshot: {} } }),
        )
      ).status,
    ).toBe(409);
    await vi.advanceTimersByTimeAsync(30000);
    expect(await (await host.fetch(new Request('http://localhost'))).json()).toEqual({
      clients: [],
    });
    host.dispose();
  });
  it('transports one bounded media chunk only to its explicit Client and refuses mixed or oversized writes', async () => {
    const host = createAppearanceControl();
    const client = await (
      await host.fetch(request({ action: 'register', platform: 'web' }))
    ).json();
    const wallpaper = { action: 'append', uploadId: 'upload', offset: 0, data: 'A'.repeat(262144) };
    for (const body of [
      {
        action: 'request',
        clientId: client.clientId,
        wallpaper: { ...wallpaper, data: 'A'.repeat(280000) },
      },
      {
        action: 'request',
        clientId: client.clientId,
        wallpaper: { action: 'remove' },
        patch: { preference: 'dark' },
        expectedRevision: 'empty',
      },
      {
        action: 'request',
        clientId: client.clientId,
        patch: { invalid: 'A'.repeat(5000) },
        expectedRevision: 'empty',
      },
    ])
      expect((await host.fetch(request(body))).status).toBe(400);
    const poll = host.fetch(request({ action: 'poll', ...client }));
    await Promise.resolve();
    const result = host.fetch(
      request({
        action: 'request',
        clientId: client.clientId,
        wallpaper,
        expectedRevision: 'empty',
      }),
    );
    const { command } = await (await poll).json();
    expect(command.wallpaper).toEqual(wallpaper);
    expect(command.expectedRevision).toBe('empty');
    await host.fetch(
      request({ action: 'reply', ...client, requestId: command.id, result: { offset: 196608 } }),
    );
    expect(await (await result).json()).toEqual({ offset: 196608 });
    host.dispose();
  });
});
