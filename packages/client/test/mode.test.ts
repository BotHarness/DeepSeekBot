import { describe, expect, it } from 'vitest';

import { registerModeShadow } from '../src/client/mode.js';
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
});
