import { describe, expect, it, vi } from 'vitest';
import { runWindowZoomCommand } from '../src/bots/cli-window-zoom.js';
describe('window zoom CLI', () => {
  it('sends default and reset through the same explicitly targeted live Client path', async () => {
    const http = vi.fn(async () => ({
      bytes: new TextEncoder().encode('{"snapshot":{"appliedLevel":1}}'),
    }));
    const connect = async () => ({ http });
    expect(
      await runWindowZoomCommand(
        'window-zoom-set',
        [],
        { 'client-id': 'c', 'expected-revision': 'r', 'zoom-level': '1', 'zoom-default': true },
        connect,
      ),
    ).toEqual({ snapshot: { appliedLevel: 1 } });
    expect(http.mock.calls[0]).toEqual([
      '/api/botharness/window-zoom-control',
      {
        action: 'request',
        clientId: 'c',
        operation: { type: 'default', level: 1 },
        expectedRevision: 'r',
      },
    ]);
  });
  it('rejects missing targets/revisions and invalid levels before connecting', async () => {
    const connect = vi.fn();
    await expect(runWindowZoomCommand('window-zoom-reset', [], {}, connect)).rejects.toMatchObject({
      code: 'usage',
    });
    await expect(
      runWindowZoomCommand(
        'window-zoom-set',
        [],
        { 'client-id': 'c', 'expected-revision': 'r', 'zoom-level': '1.2' },
        connect,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(connect).not.toHaveBeenCalled();
  });
  it('reads and schedules Host window zoom setup without a Client target', async () => {
    const http = vi.fn(async () => ({
      bytes: new TextEncoder().encode('{"supported":true,"enabled":false}'),
    }));
    const connect = async () => ({ http });
    expect(await runWindowZoomCommand('window-zoom-setup-status', [], {}, connect)).toEqual({
      supported: true,
      enabled: false,
    });
    await runWindowZoomCommand('window-zoom-setup-enable', [], {}, connect);
    await runWindowZoomCommand('window-zoom-setup-cancel', [], {}, connect);
    expect(http.mock.calls).toEqual([
      ['/api/botharness/window-zoom-setup', undefined],
      ['/api/botharness/window-zoom-setup', { action: 'enable' }],
      ['/api/botharness/window-zoom-setup', { action: 'cancel' }],
    ]);
    await expect(
      runWindowZoomCommand('window-zoom-setup-disable', [], { 'client-id': 'c' }, connect),
    ).rejects.toMatchObject({ code: 'usage' });
  });
});
