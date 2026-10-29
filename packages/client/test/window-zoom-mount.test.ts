// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  normalizeBinding,
  parseShortcutDefinitions,
  effectiveShortcuts,
} from '@deepseek-ai/dsh-client-shortcuts/protocol';
import type { ShortcutCommand } from '@deepseek-ai/dsh-client-shortcuts/client';
import { mountWindowZoom } from '../src/client/window-zoom-mount.js';
import { zhTranslate } from '../src/client/locale.js';

describe('desktop zoom shortcut ownership', () => {
  function fixture(
    fail = false,
    platform: 'macos' | 'windows' | 'linux' = 'macos',
    compatible = platform,
    runtime: 'desktop' | 'web' = 'desktop',
  ) {
    const order: string[] = [];
    const commands = new Map<string, ShortcutCommand>();
    const storage = new Map<string, string>();
    const release = vi.fn(() => {
      order.push('font-restored');
    });
    const mounted = mountWindowZoom({
      document,
      window: {
        location: new URL('dsh-app://app/'),
        addEventListener: window.addEventListener.bind(window),
        removeEventListener: window.removeEventListener.bind(window),
      },
      shortcuts: {
        runtime,
        platform,
        register(command) {
          parseShortcutDefinitions([{ id: command.id, defaults: command.defaults }]);
          for (const binding of Object.values(command.defaults))
            if (binding) normalizeBinding(binding, platform);
          if (fail && commands.size === 1) throw Error('registry unavailable');
          commands.set(command.id, command);
          return () => {
            order.push('zoom-removed');
            commands.delete(command.id);
          };
        },
      },
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
      },
      compatibility: {
        version: 1,
        desktopVersion: '0.2.1-rc.2',
        ...(compatible === 'linux' ? {} : { platform: compatible }),
        acquire: async () => release,
      },
      t: zhTranslate,
    });
    return { mounted, commands, order, release };
  }
  it('validates every default through the actual DSH protocol and restores font scope after revoking commands', async () => {
    document.documentElement.style.zoom = '';
    document.documentElement.style.setProperty('--bh-window-zoom', '0.9');
    const f = fixture();
    await vi.waitFor(() => expect(f.mounted.surface.getSnapshot()).not.toBeNull());
    expect(f.commands.size).toBe(4);
    expect(f.commands.get('botharness.zoom.reset')?.defaults).toEqual({
      'desktop:macos': { code: 'Digit0', modifiers: ['primary'] },
      'desktop:windows': { code: 'Digit0', modifiers: ['primary'] },
    });
    const action = f.commands
      .get('botharness.zoom.increase')!
      .resolve({ region: 'editable', modal: null, target: null });
    expect(action.status).toBe('handled');
    if (action.status === 'handled') action.run();
    expect(document.documentElement.style.zoom).toBe('1.2');
    expect(document.documentElement.style.getPropertyValue('--bh-window-zoom')).toBe('1.2');
    await f.mounted.dispose();
    expect(document.documentElement.style.zoom).toBe('');
    expect(document.documentElement.style.getPropertyValue('--bh-window-zoom')).toBe('0.9');
    document.documentElement.style.removeProperty('--bh-window-zoom');
    expect(f.commands.size).toBe(0);
    expect(f.order.at(-1)).toBe('font-restored');
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it.each(['macos', 'windows'] as const)(
    'resets through the registered %s command to the saved device default',
    async (platform) => {
      const f = fixture(false, platform);
      await vi.waitFor(() => expect(f.mounted.surface.getSnapshot()).not.toBeNull());
      const owner = f.mounted.surface.getSnapshot()!;
      owner.execute({ type: 'default', level: 1 });
      owner.execute({ type: 'set', level: 3 });
      const command = f.commands.get('botharness.zoom.reset')!;
      expect(command.defaults[`desktop:${platform}`]).toEqual({
        code: 'Digit0',
        modifiers: ['primary'],
      });
      const action = command.resolve({ region: 'editable', modal: null, target: null });
      expect(action.status).toBe('handled');
      if (action.status === 'handled') action.run();
      expect(owner.getSnapshot().document.defaultLevel).toBe(1);
      expect(owner.getSnapshot().document.primaryLevel).toBe(1);
      expect(document.documentElement.style.zoom).toBe('1.2');
      await f.mounted.dispose();
    },
  );
  it('rejects an unsupported platform or a lease from another platform', async () => {
    for (const [platform, compatible] of [
      ['linux', 'linux'],
      ['windows', 'macos'],
      ['macos', 'windows'],
    ] as const) {
      const f = fixture(false, platform, compatible);
      await f.mounted.dispose();
      expect(f.mounted.surface.getSnapshot()).toBeNull();
      expect(f.commands.size).toBe(0);
      expect(f.release).not.toHaveBeenCalled();
    }
  });
  it('leaves ordinary Web zoom and native font ownership with the browser', async () => {
    const f = fixture(false, 'windows', 'windows', 'web');
    await f.mounted.dispose();
    expect(f.mounted.surface.getSnapshot()).toBeNull();
    expect(f.commands.size).toBe(0);
    expect(f.release).not.toHaveBeenCalled();
  });
  it.each(['macos', 'windows'] as const)(
    'preserves %s custom bindings and yields the new default to an existing assignment',
    async (platform) => {
      const f = fixture(false, platform);
      await vi.waitFor(() => expect(f.mounted.surface.getSnapshot()).not.toBeNull());
      const definitions = parseShortcutDefinitions([
        ...[...f.commands.values()].map(({ id, defaults }) => ({ id, defaults })),
        { id: 'botharness.existing', defaults: {} },
      ]);
      const preferences: Parameters<typeof effectiveShortcuts>[1] = {
        schemaVersion: 1,
        profiles: {
          [`desktop:${platform}`]: {
            'botharness.existing': { code: 'Digit0', modifiers: ['primary'] },
          },
        },
      };
      const original = JSON.stringify(preferences);
      const rows = effectiveShortcuts(definitions, preferences, 'desktop', platform);
      expect(rows.find(({ id }) => id === 'botharness.zoom.reset')?.conflicts).toEqual([
        'botharness.existing',
      ]);
      expect(rows.find(({ id }) => id === 'botharness.existing')?.conflicts).toEqual([]);
      expect(JSON.stringify(preferences)).toBe(original);
      const unbound: Parameters<typeof effectiveShortcuts>[1] = {
        ...preferences,
        profiles: {
          ...preferences.profiles,
          [`desktop:${platform}`]: {
            ...preferences.profiles[`desktop:${platform}`],
            'botharness.zoom.reset': null,
          },
        },
      };
      expect(
        effectiveShortcuts(definitions, unbound, 'desktop', platform).find(
          ({ id }) => id === 'botharness.zoom.reset',
        )?.binding,
      ).toBeNull();
      await f.mounted.dispose();
    },
  );
  it('makes partial registration failure visible and returns the original font bindings exactly once', async () => {
    const f = fixture(true);
    await vi.waitFor(() =>
      expect(f.mounted.surface.getErrorSnapshot()).toBe('zoom-initialization-failed'),
    );
    expect(f.mounted.surface.getSnapshot()).toBeNull();
    expect(f.commands.size).toBe(0);
    await f.mounted.dispose();
    expect(f.release).toHaveBeenCalledTimes(1);
  });
});
