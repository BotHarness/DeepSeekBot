// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  return {};
});

import { observeResource } from '../../client/src/client/messaging-defaults-live.js';
import { resourceEvents } from '../../client/test/resource-events-fixture.js';
import * as client from '../src/client/index.js';

describe('browser client module face', () => {
  it('exports the plugin face the client runner mounts', () => {
    expect(typeof client.name).toBe('string');
    expect(client.name.length).toBeGreaterThan(0);
    expect(Array.isArray(client.inject)).toBe(true);
    expect(typeof client.apply).toBe('function');
  });

  it('registers the locale dictionaries and the Channel sidebar entry', () => {
    const effects: string[] = [];
    const entries: { id: string; order: number; scope: string; headerAction?: unknown }[] = [];
    const ctx = {
      locale: {
        bind: () => (key: string) => key,
        register: () => () => undefined,
      },
      effect: (callback: () => () => void, name: string) => {
        effects.push(name);
        callback();
        return () => undefined;
      },
      inject: (deps: readonly string[], callback: (child: unknown) => void) => {
        if (deps.includes('configForms')) return;
        callback({
          channelSidebar: {
            register: (entry: {
              id: string;
              order: number;
              scope: string;
              headerAction?: unknown;
            }) => {
              entries.push(entry);
              return () => undefined;
            },
          },
          connection: { rpc: { call: async () => ({ ok: true, value: { bots: [] } }) } },
        });
      },
    };
    client.apply(ctx as unknown as Parameters<typeof client.apply>[0]);
    expect(effects).toContain('botharness-browser: dictionaries');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'botharness-browser', order: 41, scope: 'personabot' });
    expect(typeof entries[0]?.headerAction).toBe('function');
  });
});

it('refreshes the Browser observation on Host events and reconnect with no fast reads', async () => {
  vi.useFakeTimers();
  const events = resourceEvents();
  let running = false;
  const fetcher = vi.fn(async () => Response.json({ running, tabs: [] }));
  vi.stubGlobal('fetch', fetcher);
  const store = client.createObservationStore('ada', (resource, refresh) =>
    observeResource(resource, refresh, 10_000, 60_000, true),
  );
  const stop = store.subscribe(() => {});
  try {
    await vi.advanceTimersByTimeAsync(30);
    expect(store.getSnapshot()?.running).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    running = true;
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    events.emit('computer');
    await vi.advanceTimersByTimeAsync(30);
    expect(fetcher).toHaveBeenCalledTimes(1);
    events.emit('browser');
    await vi.advanceTimersByTimeAsync(30);
    expect(store.getSnapshot()?.running).toBe(true);
    running = false;
    events.reconnect();
    await vi.advanceTimersByTimeAsync(30);
    expect(store.getSnapshot()?.running).toBe(false);
  } finally {
    stop();
    events.dispose();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
