import { describe, expect, it, vi } from 'vitest';

import {
  isSlotPriorityConflict,
  registerModeShadow,
  registerShadowEntry,
  SHADOW_PRIMARY_PRIORITY,
} from '../src/client/mode.js';
import { createStore } from '../src/client/store.js';

describe('mode shadow', () => {
  it('disposes the desktop roster on mobile and restores it without changing the mode', () => {
    const clientStore = createStore();
    let enabled = true;
    let notify: (() => void) | undefined;
    let teardown: (() => void) | undefined;
    let registrations = 0;
    let disposals = 0;
    const ctx = {
      slots: {
        inject: (_name: string, factory: () => unknown) => {
          teardown = factory() as () => void;
        },
      },
    };
    registerModeShadow(
      ctx as never,
      'sidebar.workspaces',
      () => {
        registrations++;
        return () => {
          disposals++;
        };
      },
      clientStore,
      {
        enabled: () => enabled,
        subscribe: (listener) => {
          notify = listener;
          return () => {
            notify = undefined;
          };
        },
      },
    );
    clientStore.setMode('bot');
    expect(registrations).toBe(1);
    enabled = false;
    notify?.();
    expect(disposals).toBe(1);
    expect(clientStore.getSnapshot().mode).toBe('bot');
    enabled = true;
    notify?.();
    expect(registrations).toBe(2);
    teardown?.();
    expect(disposals).toBe(2);
    expect(notify).toBeUndefined();
  });
  it('registers while bot mode is active and disposes on exit', () => {
    const clientStore = createStore();
    const registered: string[] = [];
    const disposed: string[] = [];
    let teardown: (() => void) | undefined;
    const ctx = {
      slots: {
        inject: (_name: string, factory: () => unknown) => {
          teardown = factory() as () => void;
        },
      },
    };

    registerModeShadow(
      ctx as never,
      'sidebar.workspaces',
      () => {
        registered.push('shadow');
        return () => {
          disposed.push('shadow');
        };
      },
      clientStore,
    );

    expect(registered).toEqual([]);
    clientStore.setMode('bot');
    expect(registered).toEqual(['shadow']);
    clientStore.setMode('bot');
    expect(registered).toEqual(['shadow']);
    clientStore.setMode('dsh');
    expect(disposed).toEqual(['shadow']);
    clientStore.setMode('bot');
    expect(registered).toEqual(['shadow', 'shadow']);

    teardown?.();
    expect(disposed).toEqual(['shadow', 'shadow']);
  });

  it('keeps shadow priorities off the conventional -100/-1 collision', () => {
    expect(SHADOW_PRIMARY_PRIORITY['sidebar.workspaces']).not.toBe(-100);
    expect(SHADOW_PRIMARY_PRIORITY.main).not.toBe(-100);
    expect(SHADOW_PRIMARY_PRIORITY.sidebar).not.toBe(-1);
  });

  it('detects exact-priority slot conflicts without matching other failures', () => {
    expect(
      isSlotPriorityConflict(
        new Error(
          'single slot "sidebar.workspaces" already has a registration at priority -100 (registered by tk) — register at a different priority to shadow it (lowest renders)',
        ),
      ),
    ).toBe(true);
    expect(
      isSlotPriorityConflict(
        new Error(
          'keyed slot "main" already has an entry for key "conversation" at priority -100 — register at a different priority to shadow it (lowest renders)',
        ),
      ),
    ).toBe(true);
    expect(isSlotPriorityConflict(new Error('slot "sidebar" is not declared'))).toBe(false);
    expect(isSlotPriorityConflict(new Error('boom'))).toBe(false);
    expect(isSlotPriorityConflict(undefined)).toBe(false);
  });

  it('survives a same-priority occupant instead of killing the renderer (#3730)', () => {
    const clientStore = createStore();
    let teardown: (() => void) | undefined;
    const warn = vi.fn();
    const ctx = {
      slots: {
        inject: (_name: string, factory: () => unknown) => {
          teardown = factory() as () => void;
        },
      },
      logger: { warn },
    };
    registerModeShadow(
      ctx as never,
      'sidebar.workspaces',
      () => {
        throw new Error(
          'single slot "sidebar.workspaces" already has a registration at priority -100 (registered by tk) — register at a different priority to shadow it (lowest renders)',
        );
      },
      clientStore,
    );
    expect(() => clientStore.setMode('bot')).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('sidebar.workspaces');
    teardown?.();
  });

  it('retries shadow registration at a fallback priority on conflict', () => {
    const attempted: number[] = [];
    const warn = vi.fn();
    const ctx = { logger: { warn } };
    const disposePrimary = vi.fn();
    const disposeFallback = vi.fn();
    const dispose = registerShadowEntry(ctx as never, 'sidebar.workspaces', (priority) => {
      attempted.push(priority);
      if (priority === SHADOW_PRIMARY_PRIORITY['sidebar.workspaces']) {
        throw new Error(
          `single slot "sidebar.workspaces" already has a registration at priority ${priority} (registered by tk) — register at a different priority to shadow it (lowest renders)`,
        );
      }
      return disposeFallback;
    });
    expect(attempted[0]).toBe(SHADOW_PRIMARY_PRIORITY['sidebar.workspaces']);
    expect(attempted.length).toBeGreaterThan(1);
    expect(warn).toHaveBeenCalled();
    dispose();
    expect(disposeFallback).toHaveBeenCalledOnce();
    expect(disposePrimary).not.toHaveBeenCalled();
  });

  it('returns a noop disposer when every shadow priority is occupied', () => {
    const warn = vi.fn();
    const ctx = { logger: { warn } };
    expect(() =>
      registerShadowEntry(ctx as never, 'main', (priority) => {
        throw new Error(
          `keyed slot "main" already has an entry for key "conversation" at priority ${priority} — register at a different priority to shadow it (lowest renders)`,
        );
      }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('rethrows non-conflict slot failures', () => {
    const clientStore = createStore();
    const ctx = {
      slots: {
        inject: (_name: string, factory: () => unknown) => {
          factory();
        },
      },
      logger: { warn: vi.fn() },
    };
    registerModeShadow(
      ctx as never,
      'main',
      () => {
        throw new Error('slot "main" is not declared');
      },
      clientStore,
    );
    expect(() => clientStore.setMode('bot')).toThrow('slot "main" is not declared');
  });
});
