import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BACKGROUND_NATIVE_MODULES,
  BACKGROUND_PAGES,
  loadWithNativeModules,
  runBackgroundCatchUp,
  type BackgroundCatchUpOptions,
} from '../src/host/background-catch-up';
import { createCatchUp, type CatchUpHost } from '../src/host/catch-up';
import { openLocalStore, type LocalStore } from '../src/host/local-store';
import { nodeSqlConnection } from './node-sql-connection';

type Saved = { hostId: string; routes: string[] };

const stores: LocalStore[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const store of stores.splice(0)) await store.close();
});

function options(
  overrides: Partial<BackgroundCatchUpOptions<Saved>> & { reachable?: string[] } = {},
) {
  const probes: string[] = [];
  const synced: { hostId: string; live: readonly string[]; route: string }[] = [];
  const reachable = new Set(overrides.reachable ?? ['https://lan', 'https://tail']);
  const base: BackgroundCatchUpOptions<Saved> = {
    hosts: async () => [
      { hostId: 'h1', routes: ['https://lan', 'https://tail'] },
      { hostId: 'h2', routes: ['https://tail'] },
    ],
    call: (_saved, route) => async (method) => {
      if (method === 'channelChangeCursor') probes.push(route);
      if (!reachable.has(route)) throw new Error('The Host could not be reached.');
      return { route };
    },
    refused: (error) => error instanceof Error && error.message === 'refused',
    liveKeys: () => [],
    sync: async (host) => {
      const answer = (await host.call('channelChanges', {})) as { route: string };
      synced.push({ hostId: host.hostId, live: host.liveKeys(), route: answer.route });
    },
    constrained: async () => false,
  };
  return { probes, synced, options: { ...base, ...overrides } };
}

describe('background catch-up startup', () => {
  it('starts the app without the task when a native module is missing from the build', () => {
    const load = vi.fn(() => 'task');
    const present = new Set(['ExpoTaskManager']);
    expect(
      loadWithNativeModules((name) => present.has(name), BACKGROUND_NATIVE_MODULES, load),
    ).toBe(undefined);
    expect(load).not.toHaveBeenCalled();
  });

  it('defines the task when the build has every native module it needs', () => {
    const load = vi.fn(() => 'task');
    expect(loadWithNativeModules(() => true, BACKGROUND_NATIVE_MODULES, load)).toBe('task');
    expect(BACKGROUND_NATIVE_MODULES).toEqual(['ExpoTaskManager', 'ExpoBackgroundTask']);
  });
});

describe('background catch-up', () => {
  it('does nothing while the phone is saving power', async () => {
    const hosts = vi.fn(async () => [{ hostId: 'h1', routes: ['https://lan'] }]);
    const run = options({ hosts, constrained: async () => true });
    expect(await runBackgroundCatchUp(run.options)).toBe('skipped');
    expect(hosts).not.toHaveBeenCalled();
    expect(run.probes).toEqual([]);
  });

  it('syncs every saved Host on its first reachable route with no conversation open', async () => {
    const run = options({ reachable: ['https://tail'] });
    expect(await runBackgroundCatchUp(run.options)).toBe('synced');
    expect(run.probes.toSorted()).toEqual(['https://lan', 'https://tail', 'https://tail']);
    expect(run.synced.toSorted((a, b) => a.hostId.localeCompare(b.hostId))).toEqual([
      { hostId: 'h1', live: [], route: 'https://tail' },
      { hostId: 'h2', live: [], route: 'https://tail' },
    ]);
  });

  it('skips a Host it cannot reach and still syncs the others', async () => {
    const run = options({
      hosts: async () => [
        { hostId: 'gone', routes: ['https://old'] },
        { hostId: 'h1', routes: ['https://lan'] },
      ],
      reachable: ['https://lan'],
    });
    expect(await runBackgroundCatchUp(run.options)).toBe('synced');
    expect(run.synced.map((entry) => entry.hostId)).toEqual(['h1']);
  });

  it('keeps syncing the other Hosts when one saved Host cannot even build a client', async () => {
    const run = options({
      hosts: async () => [
        { hostId: 'broken', routes: ['https://broken'] },
        { hostId: 'h1', routes: ['https://lan'] },
      ],
    });
    const call = run.options.call;
    run.options.call = (saved, route) => {
      if (saved.hostId === 'broken') throw new Error('malformed saved encryption');
      return call(saved, route);
    };
    expect(await runBackgroundCatchUp(run.options)).toBe('synced');
    expect(run.synced.map((entry) => entry.hostId)).toEqual(['h1']);
  });

  it('keeps going after one Host fails mid-sync', async () => {
    const run = options();
    const sync = run.options.sync;
    run.options.sync = async (host: CatchUpHost) => {
      if (host.hostId === 'h1') throw new Error('connection lost');
      await sync(host);
    };
    expect(await runBackgroundCatchUp(run.options)).toBe('synced');
    expect(run.synced.map((entry) => entry.hostId)).toEqual(['h2']);
  });

  it('stops trying a Host once it refuses this phone', async () => {
    const tried: string[] = [];
    const run = options({
      hosts: async () => [{ hostId: 'revoked', routes: ['https://a', 'https://b'] }],
      call: (_saved, route) => async () => {
        tried.push(route);
        throw new Error('refused');
      },
    });
    expect(await runBackgroundCatchUp(run.options)).toBe('synced');
    expect(tried).toEqual(['https://a']);
  });

  it('leaves conversations the app is following to their live stream', async () => {
    const run = options({
      liveKeys: (hostId) => (hostId === 'h1' ? ['["computer","h1","c1"]'] : []),
    });
    await runBackgroundCatchUp(run.options);
    expect(run.synced.find((entry) => entry.hostId === 'h1')?.live).toEqual([
      '["computer","h1","c1"]',
    ]);
    expect(run.synced.find((entry) => entry.hostId === 'h2')?.live).toEqual([]);
  });

  it('does not let a Host that never answers hold up the others', async () => {
    vi.useFakeTimers();
    const run = options({
      hosts: async () => [
        { hostId: 'stuck', routes: ['https://stuck'] },
        { hostId: 'h1', routes: ['https://lan'] },
      ],
      call: (_saved, route) => async () => {
        if (route === 'https://stuck') return new Promise(() => {});
        return { route };
      },
      deadlineMs: 25_000,
    });
    const result = runBackgroundCatchUp(run.options);
    await vi.advanceTimersByTimeAsync(1);
    expect(run.synced.map((entry) => entry.hostId)).toEqual(['h1']);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await result).toBe('failed');
  });

  it('reports failure when the saved Hosts cannot be read while the phone is locked', async () => {
    const run = options({
      hosts: async () => {
        throw new Error('User interaction is not allowed.');
      },
    });
    expect(await runBackgroundCatchUp(run.options)).toBe('failed');
    expect(run.probes).toEqual([]);
  });

  it('finishes within the time iOS allows even when a Host never answers', async () => {
    vi.useFakeTimers();
    const run = options({ call: () => () => new Promise(() => {}), deadlineMs: 25_000 });
    const result = runBackgroundCatchUp(run.options);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await result).toBe('failed');
  });

  it('pulls at most the background page budget for each conversation', async () => {
    const store = await openLocalStore(nodeSqlConnection(':memory:'));
    stores.push(store);
    await store.write(async (tx) => {
      await tx.run('insert into cursors (channel_id, epoch, seq) values (?, ?, ?)', [
        'c1',
        'e1',
        1,
      ]);
    });
    const catchUp = createCatchUp({ store: async () => store, maxPages: BACKGROUND_PAGES });
    let seq = 1;
    const pages: number[] = [];
    await catchUp.sync({
      hostId: 'h1',
      liveKeys: () => [],
      call: async (_method, args) => {
        pages.push(Number(args['sinceSeq']));
        seq += 1;
        return {
          upserts: [],
          tombstones: [],
          removed: [],
          cursor: { epoch: 'e1', seq },
          hasMore: true,
        };
      },
    });
    expect(pages).toEqual([1, 2]);
    expect(pages).toHaveLength(BACKGROUND_PAGES);
  });
});
