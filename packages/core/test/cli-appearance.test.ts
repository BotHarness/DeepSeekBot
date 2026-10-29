import { describe, it, expect, vi } from 'vitest';
import { runAppearanceCommand } from '../src/bots/cli-appearance.js';
const io = { env: {}, cwd: '/tmp', stdout: () => {}, stderr: () => {} };
describe('appearance CLI contract', () => {
  it('requires an explicit target and read revision before connecting', async () => {
    const connect = vi.fn();
    await expect(runAppearanceCommand('appearance-get', [], {}, io, connect)).rejects.toMatchObject(
      { code: 'usage' },
    );
    await expect(
      runAppearanceCommand(
        'appearance-set',
        [],
        { 'client-id': 'one', 'patch-stdin': true },
        io,
        connect,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(connect).not.toHaveBeenCalled();
  });
  it('delivers one validated JSON patch to one explicit Client and returns its acknowledgment', async () => {
    const http = vi.fn(async () => ({
      bytes: new TextEncoder().encode(
        JSON.stringify({ snapshot: { config: { revision: 'new' } } }),
      ),
    }));
    const result = await runAppearanceCommand(
      'appearance-set',
      [],
      { 'client-id': 'one', 'patch-stdin': true, 'expected-revision': 'old' },
      { ...io, readStdin: async () => JSON.stringify({ preference: 'dark' }) },
      async () => ({ http }),
    );
    expect(http).toHaveBeenCalledExactlyOnceWith('/api/botharness/appearance-control', {
      action: 'request',
      clientId: 'one',
      expectedRevision: 'old',
      patch: { preference: 'dark' },
    });
    expect(result).toEqual({ snapshot: { config: { revision: 'new' } } });
  });
  it('reads functional targets from one Client through the same owner reply', async () => {
    const reply = {
      targets: [{ id: 'dock:bh:home', label: 'Home' }],
      snapshot: { config: { revision: 'current' } },
    };
    const http = vi.fn(async () => ({ bytes: new TextEncoder().encode(JSON.stringify(reply)) }));
    expect(
      await runAppearanceCommand(
        'appearance-targets',
        [],
        { 'client-id': 'one' },
        io,
        async () => ({ http }),
      ),
    ).toEqual(reply);
    expect(http).toHaveBeenCalledExactlyOnceWith('/api/botharness/appearance-control', {
      action: 'request',
      clientId: 'one',
    });
  });
  it('rejects malformed JSON and write flags on read commands', async () => {
    const connect = vi.fn();
    await expect(
      runAppearanceCommand(
        'appearance-set',
        [],
        { 'client-id': 'one', 'patch-stdin': true, 'expected-revision': 'old' },
        { ...io, readStdin: async () => '{bad' },
        connect,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      runAppearanceCommand(
        'appearance-get',
        [],
        { 'client-id': 'one', 'patch-stdin': true },
        io,
        connect,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(connect).not.toHaveBeenCalled();
  });
});
