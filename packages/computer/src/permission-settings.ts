import type { ComputerRuntimeRunner } from './provider.js';

export async function openComputerPermissionSettings(options: {
  permission: unknown;
  authorize: unknown;
  target: string;
  runner: ComputerRuntimeRunner;
  platform?: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  if (options.authorize !== true) return { ok: false, code: 'authorize-required' };
  if ((options.platform ?? process.platform) !== 'darwin' || options.target !== 'local')
    return { ok: false, code: 'local-macos-only' };
  const pane =
    options.permission === 'accessibility'
      ? 'Privacy_Accessibility'
      : options.permission === 'screen-recording'
        ? 'Privacy_ScreenCapture'
        : undefined;
  if (!pane) return { ok: false, code: 'permission-invalid' };
  try {
    const result = await options.runner.run(
      ['/usr/bin/open', `x-apple.systempreferences:com.apple.preference.security?${pane}`],
      { timeoutMs: 10_000, maxOutputBytes: 4096 },
    );
    return result.code === 0 ? { ok: true } : { ok: false, code: 'settings-open-failed' };
  } catch {
    return { ok: false, code: 'settings-open-failed' };
  }
}
