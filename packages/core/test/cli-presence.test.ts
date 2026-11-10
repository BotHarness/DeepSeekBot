import { describe, expect, it, vi } from 'vitest';
import { runPresenceCommand } from '../src/bots/cli-presence.js';

describe('presence CLI', () => {
  it('reads status and reports one Client through the Host presence route', async () => {
    const http = vi.fn(async () => ({
      bytes: new TextEncoder().encode('{"active":true,"clients":1,"leaseMs":90000}'),
    }));
    const connect = async () => ({ http });
    expect(await runPresenceCommand('presence-status', [], {}, connect)).toMatchObject({
      active: true,
    });
    await runPresenceCommand('presence-report', [], { 'client-id': 'c1', idle: true }, connect);
    expect(http.mock.calls).toEqual([
      ['/api/botharness/presence', undefined],
      ['/api/botharness/presence', { clientId: 'c1', active: false }],
    ]);
  });

  it('rejects a report without exactly one state or Client before connecting', async () => {
    const connect = vi.fn();
    for (const values of [
      { 'client-id': 'c1' },
      { 'client-id': 'c1', active: true, idle: true },
      { active: true },
    ])
      await expect(
        runPresenceCommand('presence-report', [], values, connect),
      ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      runPresenceCommand('presence-status', [], { active: true }, connect),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(connect).not.toHaveBeenCalled();
  });
});
