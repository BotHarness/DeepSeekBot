import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPresence, PRESENCE_LEASE_MS } from '../src/push/presence.js';

const post = (body: unknown) =>
  new Request('http://host/api/botharness/presence', {
    method: 'POST',
    body: JSON.stringify(body),
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('desktop presence', () => {
  it('stays active while any Client renews its lease and reports the lapse once', async () => {
    vi.useFakeTimers();
    const presence = createPresence();
    const changed = vi.fn();
    presence.subscribe(changed);
    expect(presence.active()).toBe(false);
    await presence.fetch(post({ clientId: 'tab-a', active: true }));
    await presence.fetch(post({ clientId: 'tab-b', active: true }));
    expect(presence.active()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    await presence.fetch(post({ clientId: 'tab-a', active: false }));
    expect(presence.active()).toBe(true);
    vi.advanceTimersByTime(PRESENCE_LEASE_MS + 5);
    expect(presence.active()).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
    const status = await presence.fetch(new Request('http://host/api/botharness/presence'));
    expect(await status.json()).toEqual({
      active: false,
      clients: 0,
      leaseMs: PRESENCE_LEASE_MS,
    });
    presence.dispose();
  });

  it('refuses malformed reports without changing state', async () => {
    const presence = createPresence();
    for (const body of [{ clientId: 'a' }, { clientId: 'a b', active: true }, 'x']) {
      const response = await presence.fetch(post(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'presence-invalid-input' },
      });
    }
    expect(presence.active()).toBe(false);
    presence.dispose();
  });
});
