import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCatchUp } from '../src/host/catch-up';
import { openLocalStore, type LocalStore } from '../src/host/local-store';
import { nodeSqlConnection } from './node-sql-connection';

const battery = vi.hoisted(() => ({
  lowPower: false,
  level: 0.5,
  state: 1,
}));
vi.mock('expo-battery', () => {
  return {
    BatteryState: { UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3 },
    isLowPowerModeEnabledAsync: async () => battery.lowPower,
    getBatteryLevelAsync: async () => battery.level,
    getBatteryStateAsync: async () => battery.state,
  };
});

const stores: LocalStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  Object.assign(battery, { lowPower: false, level: 0.5, state: 1 });
  vi.resetModules();
});

async function storeWith(channels: string[]) {
  const store = await openLocalStore(nodeSqlConnection(':memory:'));
  stores.push(store);
  await store.write(async (tx) => {
    for (const channelId of channels)
      await tx.run('insert into cursors (channel_id, epoch, seq) values (?, ?, ?)', [
        channelId,
        'e1',
        1,
      ]);
  });
  return store;
}

function host(calls: string[]) {
  return {
    hostId: 'h1',
    liveKeys: () => [],
    call: async (_method: string, args: Record<string, unknown>) => {
      calls.push(String(args['channelId']));
      return {
        upserts: [],
        tombstones: [],
        removed: [],
        cursor: { epoch: 'e1', seq: 2 },
        hasMore: false,
      };
    },
  };
}

describe('catch-up power gate', () => {
  it('does not start while the phone is constrained', async () => {
    const store = await storeWith(['c1', 'c2']);
    const calls: string[] = [];
    await createCatchUp({ store: async () => store, constrained: async () => true }).sync(
      host(calls),
    );
    expect(calls).toEqual([]);
  });

  it('stops before the next channel once the phone becomes constrained', async () => {
    const store = await storeWith(['c1', 'c2', 'c3']);
    const calls: string[] = [];
    let checks = 0;
    await createCatchUp({
      store: async () => store,
      concurrency: 1,
      constrained: async () => ++checks > 2,
    }).sync(host(calls));
    expect(calls).toHaveLength(1);
    const cursors = await store.all<{ channel_id: string; seq: number }>(
      'select channel_id, seq from cursors order by channel_id',
    );
    expect(cursors).toEqual(
      ['c1', 'c2', 'c3'].map((channelId) => ({
        channel_id: channelId,
        seq: channelId === calls[0] ? 2 : 1,
      })),
    );
  });

  it('does not pull once another worker has seen the constraint', async () => {
    const store = await storeWith(['c1', 'c2', 'c3', 'c4']);
    const calls: string[] = [];
    let checks = 0;
    await createCatchUp({
      store: async () => store,
      concurrency: 2,
      constrained: async () => {
        checks += 1;
        if (checks === 1) return false;
        if (checks === 2) return true;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return false;
      },
    }).sync(host(calls));
    expect(calls).toEqual([]);
  });

  it('keeps going when the power check fails', async () => {
    const store = await storeWith(['c1', 'c2']);
    const calls: string[] = [];
    await createCatchUp({
      store: async () => store,
      constrained: async () => {
        throw new Error('unavailable');
      },
    }).sync(host(calls));
    expect(calls.sort()).toEqual(['c1', 'c2']);
  });
});

describe('native power reading', () => {
  const read = async () => (await import('../src/host/native-power')).powerConstrained();

  it('is constrained in Low Power Mode', async () => {
    battery.lowPower = true;
    expect(await read()).toBe(true);
  });

  it('is constrained below 20% while unplugged, not while charging', async () => {
    battery.level = 0.1;
    expect(await read()).toBe(true);
    battery.state = 2;
    expect(await read()).toBe(false);
  });

  it('is not constrained when the level is unknown', async () => {
    battery.level = -1;
    expect(await read()).toBe(false);
  });

  it('is not constrained when the native module is missing', async () => {
    battery.lowPower = true;
    vi.doMock('expo-battery', () => {
      throw new Error('native module missing');
    });
    vi.resetModules();
    expect(await read()).toBe(false);
  });
});
