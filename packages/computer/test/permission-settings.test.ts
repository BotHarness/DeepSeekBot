import { expect, it, vi } from 'vitest';
import { openComputerPermissionSettings } from '../src/permission-settings.js';

it.each([
  ['accessibility', 'Privacy_Accessibility'],
  ['screen-recording', 'Privacy_ScreenCapture'],
])('opens only the fixed %s privacy pane', async (permission, pane) => {
  const runner = { run: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })) };
  expect(
    await openComputerPermissionSettings({
      permission,
      authorize: true,
      target: 'local',
      platform: 'darwin',
      runner,
    }),
  ).toEqual({ ok: true });
  expect(runner.run).toHaveBeenCalledWith(
    ['/usr/bin/open', `x-apple.systempreferences:com.apple.preference.security?${pane}`],
    { timeoutMs: 10000, maxOutputBytes: 4096 },
  );
});
it.each([
  { authorize: false, code: 'authorize-required' },
  { platform: 'linux', code: 'local-macos-only' },
  { target: 'container', code: 'local-macos-only' },
  { permission: 'file:///tmp/private', code: 'permission-invalid' },
])('refuses unsafe or inapplicable settings requests: $code', async (override) => {
  const runner = { run: vi.fn() };
  const result = await openComputerPermissionSettings({
    permission: 'accessibility',
    authorize: true,
    platform: 'darwin',
    target: 'local',
    ...override,
    runner,
  });
  expect(result).toEqual({ ok: false, code: override.code });
  expect(runner.run).not.toHaveBeenCalled();
});
it('returns a coded failure without raw command output', async () => {
  const runner = {
    run: vi.fn(async () => {
      throw new Error('private path');
    }),
  };
  expect(
    await openComputerPermissionSettings({
      permission: 'accessibility',
      authorize: true,
      target: 'local',
      platform: 'darwin',
      runner,
    }),
  ).toEqual({ ok: false, code: 'settings-open-failed' });
});
