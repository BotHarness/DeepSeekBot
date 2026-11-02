import { describe, it, expect, vi } from 'vitest';
import { runAppearanceCommand } from '../src/bots/cli-appearance.js';
const io = { stdout: () => {}, stderr: () => {}, env: {} };
describe('directed appearance recovery CLI', () => {
  it('requires reset confirmation and both revisions before connecting', async () => {
    const connect = vi.fn();
    for (const values of [
      { 'client-id': 'one', 'expected-revision': 'p', 'expected-wallpaper-revision': 'w' },
      { 'client-id': 'one', 'expected-revision': 'p', 'confirm-reset': true },
    ])
      await expect(
        runAppearanceCommand('appearance-reset', [], values, io, connect),
      ).rejects.toMatchObject({ code: 'usage' });
    expect(connect).not.toHaveBeenCalled();
  });
  it('uses the same explicit Client recovery command and current-mode clear patch', async () => {
    const http = vi.fn(async () => ({ bytes: new TextEncoder().encode('{"complete":true}') }));
    const connect = async () => ({ http });
    await runAppearanceCommand(
      'appearance-reset',
      [],
      {
        'client-id': 'one',
        'expected-revision': 'p',
        'expected-wallpaper-revision': 'w',
        'confirm-reset': true,
      },
      io,
      connect,
    );
    expect(http).toHaveBeenLastCalledWith('/api/botharness/appearance-control', {
      action: 'request',
      clientId: 'one',
      expectedRevision: 'p',
      recovery: { action: 'reset-all', confirmed: true, wallpaperRevision: 'w' },
    });
    await runAppearanceCommand(
      'appearance-clear-panels',
      [],
      { 'client-id': 'one', 'expected-revision': 'p', mode: 'dark' },
      io,
      connect,
    );
    expect(http).toHaveBeenLastCalledWith('/api/botharness/appearance-control', {
      action: 'request',
      clientId: 'one',
      expectedRevision: 'p',
      patch: { mode: 'dark', clearPanels: true },
    });
  });
});
