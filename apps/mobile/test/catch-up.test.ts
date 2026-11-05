import { afterEach, describe, expect, it } from 'vitest';

import { createCatchUp } from '../src/host/catch-up';
import { openLocalStore, type LocalStore } from '../src/host/local-store';
import { nodeSqlConnection } from './node-sql-connection';

const stores: LocalStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
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

const page = {
  upserts: [],
  tombstones: [],
  removed: [],
  cursor: { epoch: 'e1', seq: 2 },
  hasMore: false,
};

describe('catch-up across reconnects', () => {
  it('runs again on the new connection when a reconnect arrives mid-sync', async () => {
    const store = await storeWith(['c1']);
    const catchUp = createCatchUp({ store: async () => store });
    let fail!: () => void;
    const stalled = new Promise<void>((resolve) => (fail = resolve));
    const fresh: string[] = [];
    const first = catchUp.sync({
      hostId: 'h1',
      liveKeys: () => [],
      call: async () => {
        await stalled;
        throw new Error('connection lost');
      },
    });
    const second = catchUp.sync({
      hostId: 'h1',
      liveKeys: () => [],
      call: async (_method, args) => {
        fresh.push(String(args['channelId']));
        return page;
      },
    });
    fail();
    await first;
    await second;
    expect(fresh).toEqual(['c1']);
    expect(await store.get('select seq from cursors where channel_id = ?', ['c1'])).toEqual({
      seq: 2,
    });
  });
});
