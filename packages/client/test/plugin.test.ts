import { describe, expect, it, vi } from 'vitest';

import { apply, Config, name } from '../src/index.js';

describe('@botharness/ui host half', () => {
  it('exposes the plugin identity', () => {
    expect(name).toBe('botharness-client');
    expect(apply).toBeTypeOf('function');
  });

  it('projects live BOT-mode Config defaults and overrides', () => {
    const defaults = Config({});
    expect(defaults.botIcon.get()).toBe('mascot');
    expect(defaults.developerMode.get()).toBe(false);
    expect(defaults.autoAcceptGroupInvites.get()).toBe(true);
    expect(defaults.motionPreference.get()).toBe('system');
    expect(defaults.sortMode.get()).toBe('updated');
    expect(defaults.sortModes.get()).toEqual({});

    const custom = Config({ developerMode: true, sortMode: 'manual', sortModes: { s1: 'manual' } });
    expect(custom.sortMode.get()).toBe('manual');
    expect(custom.developerMode.get()).toBe(true);
    expect(custom.sortModes.get()).toEqual({ s1: 'manual' });
  });

  it('suppresses the native generated page when its custom settings page is present', () => {
    const configure = vi.fn(() => () => undefined);
    const fiber = {};
    const ctx = {
      fiber,
      inject: (_deps: string[], callback: (ctx: unknown) => unknown) => {
        callback({ settings: { configure }, effect: (factory: () => unknown) => factory() });
      },
    };

    apply(ctx as never);

    expect(configure).toHaveBeenCalledWith({ auto: false }, fiber);
  });

  it('loads without a settings provider', () => {
    const inject = vi.fn(() => undefined);
    expect(() => {
      apply({ inject } as never);
    }).not.toThrow();
    expect(inject).toHaveBeenCalledWith(['settings'], expect.any(Function));
  });
});

describe('Host Group invitation policy binding', () => {
  it('binds the native volatile setting for the lifetime of its Fiber', () => {
    const config = Config({ autoAcceptGroupInvites: false });
    const dispose = vi.fn();
    const configureGroupInvitations = vi.fn((read: () => boolean) => {
      expect(read()).toBe(false);
      return dispose;
    });
    const effects: unknown[] = [];
    const ctx = {
      inject: (deps: string[], callback: (child: unknown) => unknown) => {
        if (deps.includes('botharness'))
          callback({
            botharness: { configureGroupInvitations },
            effect: (factory: () => unknown) => effects.push(factory()),
          });
      },
    };
    apply(ctx as never, config);
    expect(configureGroupInvitations).toHaveBeenCalledOnce();
    expect(effects[0]).toBe(dispose);
  });
});

describe('Host Assignment limit binding', () => {
  it('binds the live volatile value and releases it with its Fiber', () => {
    const config = Config({ assignmentConcurrencyLimit: 2 });
    let read: (() => number) | undefined;
    const dispose = vi.fn();
    const ctx = {
      inject: (deps: string[], callback: (ctx: unknown) => unknown) => {
        if (deps.includes('botharness'))
          callback({
            botharness: {
              configureGroupInvitations: () => () => undefined,
              configureAssignmentConcurrencyLimit: (value: () => number) => {
                read = value;
                return dispose;
              },
            },
            effect: (factory: () => unknown) => factory(),
          });
      },
    };
    apply(ctx as never, config);
    expect(read?.()).toBe(2);
    config.assignmentConcurrencyLimit = Config({
      assignmentConcurrencyLimit: 5,
    }).assignmentConcurrencyLimit;
    expect(read?.()).toBe(5);
  });
  it.each([0, 33, 1.5, NaN, Infinity, '3'])('rejects invalid Host config %s', (value) => {
    expect(() => Config({ assignmentConcurrencyLimit: value as never })).toThrow();
  });
  it('defaults old Profiles to three and accepts both range boundaries', () => {
    expect(Config({}).assignmentConcurrencyLimit.get()).toBe(8);
    expect(Config({ assignmentConcurrencyLimit: 1 }).assignmentConcurrencyLimit.get()).toBe(1);
    expect(Config({ assignmentConcurrencyLimit: 32 }).assignmentConcurrencyLimit.get()).toBe(32);
  });
});
