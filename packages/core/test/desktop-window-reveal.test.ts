import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runDesktopWindowCommand } from '../src/bots/cli-desktop-window.js';
import { createDesktopWindowReveal, userDataArgument } from '../src/desktop-window/reveal.js';

function desktopInstall(): { dir: string; exe: string; host: string } {
  const dir = mkdtempSync(join(tmpdir(), 'bh-desktop-'));
  mkdirSync(join(dir, 'resources/runtime/primary-runtime/dependencies/pnpm/bin'), {
    recursive: true,
  });
  writeFileSync(join(dir, 'resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs'), '');
  const exe = join(dir, 'DeepSeek Harness.exe');
  writeFileSync(exe, '');
  return { dir, exe, host: join(dir, 'resources/app.asar.unpacked/dsh/host.mjs') };
}

const reveal = (body: unknown) =>
  new Request('http://host/api/botharness/desktop-window', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('desktop window reveal', () => {
  it('relaunches the same Desktop with its user data so the shell focuses the running window', async () => {
    const install = desktopInstall();
    const spawned: { command: string; args: readonly string[]; env: NodeJS.ProcessEnv }[] = [];
    let at = 1_000;
    const window = createDesktopWindowReveal({
      platform: 'win32',
      execPath: install.exe,
      argv: [install.exe, install.host],
      env: { ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--inspect', DSH_HOME: 'D:\\home' },
      parentPid: 42,
      now: () => at,
      parentCommandLine: async (pid) =>
        pid === 42 ? `"${install.exe}" "--user-data-dir=D:\\qa data\\browser" --flag` : undefined,
      spawn: (command, args, options) => {
        spawned.push({ command, args, env: options.env ?? {} });
        return { unref: () => undefined };
      },
    });
    const first = await window.fetch(reveal({ action: 'reveal' }));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, launched: true });
    expect(spawned).toEqual([
      {
        command: install.exe,
        args: ['--user-data-dir=D:\\qa data\\browser'],
        env: { DSH_HOME: 'D:\\home' },
      },
    ]);
    at += 500;
    expect(await window.reveal()).toEqual({ ok: true, launched: false });
    at += 2_000;
    expect(await window.reveal()).toEqual({ ok: true, launched: true });
    expect(spawned).toHaveLength(2);
  });

  it('refuses outside the Windows Desktop and rejects other actions', async () => {
    const install = desktopInstall();
    const spawn = vi.fn(() => ({ unref: () => undefined }));
    const mac = createDesktopWindowReveal({ platform: 'darwin', spawn });
    expect(await mac.reveal()).toEqual({ ok: false, code: 'desktop-window-platform-unsupported' });
    const cli = createDesktopWindowReveal({
      platform: 'win32',
      execPath: 'C:\\node\\node.exe',
      argv: ['C:\\node\\node.exe', 'D:\\repo\\host.mjs'],
      spawn,
    });
    const refused = await cli.fetch(reveal({ action: 'reveal' }));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ ok: false, code: 'desktop-window-app-unresolved' });
    const desktop = createDesktopWindowReveal({
      platform: 'win32',
      execPath: install.exe,
      argv: [install.exe, install.host],
      parentCommandLine: async () => undefined,
      spawn,
    });
    expect((await desktop.fetch(reveal({ action: 'quit' }))).status).toBe(400);
    expect(spawn).not.toHaveBeenCalled();
    expect(await desktop.reveal()).toEqual({ ok: true, launched: true });
    expect(spawn).toHaveBeenCalledWith(install.exe, [], expect.anything());
  });

  it('reads the user data argument from a quoted or plain command line', () => {
    expect(userDataArgument('"a.exe" --user-data-dir=C:\\x\\y --z')).toBe(
      '--user-data-dir=C:\\x\\y',
    );
    expect(userDataArgument('"a.exe" "--user-data-dir=C:\\a b"')).toBe('--user-data-dir=C:\\a b');
    expect(userDataArgument('"a.exe" --other')).toBeUndefined();
    expect(userDataArgument(undefined)).toBeUndefined();
  });

  it('runs from the CLI against the same Host route', async () => {
    const http = vi.fn(async () => ({
      bytes: new TextEncoder().encode(JSON.stringify({ ok: true, launched: true })),
    }));
    expect(await runDesktopWindowCommand([], async () => ({ http }))).toEqual({
      ok: true,
      launched: true,
    });
    expect(http).toHaveBeenCalledWith('/api/botharness/desktop-window', { action: 'reveal' });
    await expect(runDesktopWindowCommand(['x'], async () => ({ http }))).rejects.toMatchObject({
      code: 'usage',
    });
  });
});
