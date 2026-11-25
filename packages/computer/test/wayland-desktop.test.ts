import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWaylandDesktop } from '../src/desktop-availability.js';
import { createComputerPauseStore, createLocalVideoOwner } from '../src/local-video-owner.js';
import { createWaylandDesktop } from '../src/providers/wayland.js';
import { createComputerTargetRuntime } from '../src/target.js';
import { deferred } from './local-video-owner-fixture.js';

const granted = '1a0c06fa-e34d-4801-ac06-0b5a51b92a10';
const rotated = '2a0c06fa-e34d-4801-ac06-0b5a51b92a10';
const caller = { deviceId: 'paired-phone' };
const cleanup: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

function portal() {
  const dir = mkdtempSync(join(tmpdir(), 'computer-wayland-test-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const writes: object[] = [];
  let message = (_value: unknown): void => {};
  const open: NonNullable<Parameters<typeof createWaylandDesktop>[0]['open']> = (handlers) => {
    message = handlers.message;
    return {
      write(value) {
        writes.push(value);
        if ('method' in value && value.method === 'get_screen_size' && 'id' in value)
          queueMicrotask(() =>
            handlers.message({ id: value.id, value: { width: 20, height: 30 } }),
          );
      },
      close: async () => handlers.exited(true),
    };
  };
  const onUnavailable = vi.fn();
  const desktop = createWaylandDesktop({
    profileDir: dir,
    open,
    onStatusChanged: vi.fn(),
    onUnavailable,
  });
  cleanup.push(() => desktop.provider.stop());
  return { ...desktop, dir, writes, message: (value: unknown) => message(value), onUnavailable };
}

describe('GNOME Wayland Computer target', () => {
  it.skipIf(process.platform !== 'linux')(
    'pastes exact UTF-8 through the GNOME clipboard portal',
    () => {
      execFileSync(
        '/usr/bin/python3',
        [
          '-B',
          fileURLToPath(new URL('./wayland-clipboard-fixture.py', import.meta.url)),
          fileURLToPath(new URL('../native/wayland/portal-desktop.py', import.meta.url)),
        ],
        { shell: false, windowsHide: true },
      );
    },
  );

  it('selects GNOME Wayland separately from X11 or the Xwayland display', () => {
    expect(
      isWaylandDesktop({
        XDG_SESSION_TYPE: 'wayland',
        XDG_CURRENT_DESKTOP: 'ubuntu:GNOME',
        DISPLAY: ':0',
      }),
    ).toBe(true);
    expect(
      isWaylandDesktop({ XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'KDE', DISPLAY: ':0' }),
    ).toBe(false);
    expect(
      isWaylandDesktop({ XDG_SESSION_TYPE: 'x11', XDG_CURRENT_DESKTOP: 'GNOME', DISPLAY: ':0' }),
    ).toBe(false);
  });

  it('waits for consent and verified capture, keeps the token private, and reuses the rotated token', async () => {
    const h = portal();
    const path = join(h.dir, 'computer-wayland-permission');
    const denied = expect(h.provider.start()).rejects.toMatchObject({
      code: 'desktop-consent-required',
    });
    await vi.waitFor(() => expect(h.writes).toEqual([{ method: 'start' }]));
    expect(await h.provider.status()).toMatchObject({
      state: 'stopped',
      refusal: 'desktop-consent-pending',
    });
    await expect(h.driver.call('get_desktop_state', {})).rejects.toMatchObject({
      code: 'desktop-consent-pending',
    });
    h.message({ state: 'ready' });
    await denied;

    const start = h.provider.start();
    await vi.waitFor(() => expect(h.writes).toHaveLength(2));
    h.message({ token: granted });
    expect(await h.provider.status()).toMatchObject({ state: 'stopped' });
    expect(readFileSync(path, 'utf8').trim()).toBe(granted);
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
    h.message({ state: 'ready' });
    await start;
    expect(await h.provider.status()).toEqual({ state: 'running', phase: 'running' });
    const screenshot = h.driver.call('get_desktop_state', {});
    expect(h.writes.at(-1)).toEqual({ method: 'get_desktop_state', id: 1, args: {} });
    h.message({ id: 1, value: { width: 20, height: 30, image: 'YQ==' } });
    await expect(screenshot).resolves.toMatchObject({
      content: [{ type: 'image', mimeType: 'image/jpeg' }],
    });

    await h.provider.stop();
    const restore = h.provider.start();
    await vi.waitFor(() => expect(h.writes.at(-1)).toEqual({ method: 'start', token: granted }));
    h.message({ token: rotated });
    h.message({ state: 'ready' });
    await restore;
    expect(readFileSync(path, 'utf8').trim()).toBe(rotated);
    expect(JSON.stringify(await h.provider.status())).not.toContain(rotated);
  });

  it('rejects the old input on lock, keeps the same target, and requires Resume after recovery', async () => {
    const h = portal();
    const runtime = createComputerTargetRuntime({
      target: () => 'current-desktop',
      create: () => h,
      onChange: vi.fn(),
    });
    cleanup.push(() => runtime.dispose());
    const pause = createComputerPauseStore(join(h.dir, 'pause.json'));
    const owner = createLocalVideoOwner({
      pause,
      driver: runtime.driver,
      isRunning: runtime.isRunning,
      unavailable: runtime.unavailable,
      media: {
        open: async () => {
          throw new Error('Expected frame transport');
        },
      },
      frames: {
        enabled: () => true,
        next: async () => ({
          seq: 1,
          width: 20,
          height: 30,
          data: 'YQ==',
          mimeType: 'image/jpeg',
          capturedAt: 1,
        }),
      },
    });
    cleanup.push(() => owner.dispose());
    let drained = Promise.resolve();
    h.onUnavailable.mockImplementation(() => {
      drained = owner.pauseUnavailable();
    });
    const start = runtime.provider.start();
    await vi.waitFor(() => expect(h.writes).toHaveLength(1));
    h.message({ token: granted });
    h.message({ state: 'ready' });
    await start;
    const opened = await owner.handle(caller, { kind: 'open' });
    expect(opened.binding).toBeDefined();
    if (opened.binding === undefined) throw new Error('Expected binding');
    const binding = opened.binding;
    await owner.handle(caller, { kind: 'frame', binding });
    const computer = deferred<string>();
    const browser = deferred<string>();
    const computerResult = expect(
      owner.runBotOperation(() => computer.promise),
    ).rejects.toMatchObject({ code: 'control-required' });
    const browserResult = expect(
      owner.runBotOperation(() => browser.promise),
    ).rejects.toMatchObject({ code: 'control-required' });
    h.message({ state: 'desktop-locked' });
    expect(pause.read()).toBe(true);
    expect(runtime.isRunning()).toBe(false);
    await expect(owner.handle(caller, { kind: 'frame', binding })).rejects.toMatchObject({
      code: 'desktop-locked',
    });
    await expect(
      owner.handle(caller, { kind: 'resume', runtimeId: opened.runtimeId }),
    ).rejects.toMatchObject({ code: 'desktop-locked' });
    await expect(runtime.driver.call('click', { x: 2, y: 3 })).rejects.toMatchObject({
      code: 'desktop-locked',
    });
    h.message({ state: 'desktop-restoring' });
    h.message({ token: rotated });
    const check = runtime.provider.start();
    await Promise.resolve();
    await Promise.resolve();
    h.message({ state: 'ready' });
    await check;
    expect(h.writes.filter((write) => 'method' in write && write.method === 'start')).toHaveLength(
      1,
    );
    expect(runtime.isRunning()).toBe(true);
    await expect(owner.runBotOperation(async () => 'new operation')).rejects.toMatchObject({
      code: 'control-required',
    });
    computer.resolve('old frame');
    browser.resolve('old browser state');
    await Promise.all([computerResult, browserResult, drained]);
    await owner.handle(caller, { kind: 'frame', binding });
    const takeover = await owner.handle(caller, { kind: 'takeover', binding });
    expect(takeover).toMatchObject({ paused: true, controller: true });
    const released = await owner.handle(caller, { kind: 'release', binding });
    expect(released).toMatchObject({ paused: true, controller: false });
    await owner.handle(caller, { kind: 'resume', runtimeId: opened.runtimeId });
    expect(pause.read()).toBe(false);
    await expect(owner.runBotOperation(async () => 'fresh observation')).resolves.toBe(
      'fresh observation',
    );
  });
});

it('refuses to start a replacement target while an authorized start waits for shutdown', async () => {
  const stopping = deferred<void>();
  const stopped = vi.fn();
  const started = vi.fn(async () => {});
  const h = portal();
  let target: 'container' | 'current-desktop' | 'local' = 'container';
  const runtime = createComputerTargetRuntime({
    target: () => target,
    create: (selection) => ({
      driver: h.driver,
      provider: {
        ...h.provider,
        start: started,
        stop: selection === 'container' ? () => stopping.promise : async () => {},
      },
    }),
    onChange: stopped,
  });
  cleanup.push(() => runtime.dispose());
  target = 'current-desktop';
  const start = expect(runtime.provider.start()).rejects.toThrow('Computer Target changed');
  expect(stopped).toHaveBeenCalledOnce();
  target = 'local';
  stopping.resolve();
  await start;
  expect(started).not.toHaveBeenCalled();
  await runtime.provider.start();
  expect(started).toHaveBeenCalledOnce();
});
