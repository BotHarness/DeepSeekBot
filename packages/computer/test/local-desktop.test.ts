import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalDesktop } from '../src/tool/local-desktop.js';
import type { LocalDisplay } from '../src/tool/local-display.js';

afterEach(() => vi.useRealTimers());

function display(): LocalDisplay & { stop: ReturnType<typeof vi.fn> } {
  return {
    display: ':71',
    env: { DBUS_SESSION_BUS_ADDRESS: 'private-bus', XAUTHORITY: 'private-authority' },
    managed: true,
    alive: () => true,
    stop: vi.fn(async () => undefined),
  };
}

describe('one Local desktop binding for input and video', () => {
  it('does not create a desktop when a viewer asks for a binding', async () => {
    const open = vi.fn(async () => display());
    const desktop = createLocalDesktop({ env: {}, open });
    expect(() => desktop.current()).toThrow('unavailable');
    expect(open).not.toHaveBeenCalled();
    await desktop.close();
  });

  it('shares concurrent startup and the actual selected display without changing Host environment', async () => {
    const selected = display();
    const open = vi.fn(async () => selected);
    const source = { DISPLAY: ':wrong', WAYLAND_DISPLAY: 'wayland-0', PATH: '/usr/bin' };
    const desktop = createLocalDesktop({ env: source, open });
    try {
      const [input, video] = await Promise.all([desktop.ensure(), desktop.ensure()]);
      expect(input).toBe(video);
      expect(desktop.current()).toBe(input);
      expect(input.env).toEqual({
        DISPLAY: ':71',
        PATH: '/usr/bin',
        XDG_SESSION_TYPE: 'x11',
        DBUS_SESSION_BUS_ADDRESS: 'private-bus',
        XAUTHORITY: 'private-authority',
      });
      expect(source.DISPLAY).toBe(':wrong');
      expect(source.WAYLAND_DISPLAY).toBe('wayland-0');
      expect(open).toHaveBeenCalledOnce();
    } finally {
      await desktop.close();
    }
    expect(selected.stop).toHaveBeenCalledOnce();
  });

  it('invalidates the generation before replacement after a display dies', async () => {
    vi.useFakeTimers();
    let alive = true;
    const first = { ...display(), alive: () => alive };
    const second = display();
    const open = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const invalidated = vi.fn();
    const desktop = createLocalDesktop({ env: {}, open, onInvalidate: invalidated });
    const old = await desktop.ensure();
    alive = false;
    await vi.advanceTimersByTimeAsync(200);
    expect(old.alive()).toBe(false);
    expect(invalidated).toHaveBeenCalledOnce();
    expect(() => desktop.current()).toThrow('unavailable');
    const replacement = await desktop.ensure();
    expect(replacement.generation).not.toBe(old.generation);
    expect(first.stop).toHaveBeenCalledOnce();
    await desktop.close();
  });

  it('keeps failed cleanup poisoned instead of creating another desktop', async () => {
    const selected = display();
    selected.stop.mockRejectedValue(new Error('tree not empty'));
    const open = vi.fn(async () => selected);
    const desktop = createLocalDesktop({ env: {}, open });
    await desktop.ensure();
    await expect(desktop.close()).rejects.toThrow('tree not empty');
    await expect(desktop.ensure()).rejects.toThrow('cleanup was not confirmed');
    expect(open).toHaveBeenCalledOnce();
  });

  it('closes startup that completes after stop without exposing its binding', async () => {
    let resolve: ((value: LocalDisplay) => void) | undefined;
    const selected = display();
    const desktop = createLocalDesktop({
      env: {},
      open: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    const starting = desktop.ensure();
    await Promise.resolve();
    const stopping = desktop.close();
    resolve?.(selected);
    await starting;
    await stopping;
    expect(() => desktop.current()).toThrow('unavailable');
    expect(selected.stop).toHaveBeenCalledOnce();
  });
});
