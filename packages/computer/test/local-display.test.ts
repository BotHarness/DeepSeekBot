import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { LocalDesktopMissingError, ensureLocalDisplay } from '../src/tool/local-display.js';

const hasXvfb = (() => {
  try {
    execFileSync('sh', ['-c', 'command -v Xvfb && command -v openbox && command -v dbus-daemon'], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
})();

describe('Linux Local Computer display', () => {
  it('uses the session display when DSH runs on a desktop', async () => {
    const display = await ensureLocalDisplay({
      source: { DISPLAY: ':0', XDG_CURRENT_DESKTOP: 'GNOME', PATH: '' },
    });
    expect(display).toMatchObject({ display: ':0', managed: false });
    await display.stop();
  });

  it('asks for a window manager when DISPLAY is a bare X server', async () => {
    const refused = await ensureLocalDisplay({
      source: { DISPLAY: ':99', PATH: '/nonexistent' },
    }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(LocalDesktopMissingError);
    expect((refused as LocalDesktopMissingError).packages).toContain('openbox');
    expect((refused as LocalDesktopMissingError).packages).not.toContain('xvfb');
  });

  it('refuses with install guidance when there is no display and no Xvfb', async () => {
    const refused = await ensureLocalDisplay({ source: { PATH: '/nonexistent' } }).catch(
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(LocalDesktopMissingError);
    expect((refused as LocalDesktopMissingError).packages).toEqual(
      expect.arrayContaining(['xvfb', 'openbox', 'dbus']),
    );
  });

  it.skipIf(process.platform !== 'linux' || !hasXvfb)(
    'starts a private Xvfb on a server and stops it',
    async () => {
      const onEvent = vi.fn();
      const display = await ensureLocalDisplay({
        source: { PATH: process.env['PATH'] },
        onEvent,
      });
      expect(display.managed).toBe(true);
      expect(display.display).toMatch(/^:\d+$/);
      expect(existsSync(`/tmp/.X11-unix/X${display.display.slice(1)}`)).toBe(true);
      expect(display.alive()).toBe(true);
      await display.stop();
      expect(display.alive()).toBe(false);
      expect(display.env['DBUS_SESSION_BUS_ADDRESS']).toMatch(/^unix:/);
      expect(onEvent.mock.calls.map(([detail]) => String(detail).split(' ')[0])).toEqual([
        'phase=display',
        'phase=display-stopped',
      ]);
    },
    15000,
  );

  it.skipIf(process.platform !== 'linux' || !hasXvfb)(
    'adds a window manager to an existing Xvfb and reuses one already running',
    async () => {
      const server = spawn(
        'Xvfb',
        ['-displayfd', '3', '-screen', '0', '800x600x24', '-nolisten', 'tcp'],
        { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] },
      );
      const number = await new Promise<string>((resolve) =>
        server.stdio[3]?.once('data', (chunk: Buffer) => resolve(chunk.toString().trim())),
      );
      const source = { DISPLAY: `:${number}`, PATH: process.env['PATH'] };
      try {
        const first = vi.fn();
        const display = await ensureLocalDisplay({ source, onEvent: first });
        expect(display).toMatchObject({ display: `:${number}`, managed: false });
        expect(String(first.mock.calls[0]?.[0])).toMatch(/wm=(?!existing)/);
        expect(display.env['DBUS_SESSION_BUS_ADDRESS']).toMatch(/^unix:/);
        const second = vi.fn();
        const again = await ensureLocalDisplay({ source, onEvent: second });
        expect(String(second.mock.calls[0]?.[0])).toContain('wm=existing');
        await again.stop();
        expect(display.alive()).toBe(true);
        await display.stop();
        expect(display.alive()).toBe(false);
      } finally {
        server.kill('SIGTERM');
      }
    },
    15000,
  );
});
