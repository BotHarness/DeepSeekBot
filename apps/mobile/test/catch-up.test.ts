import { afterEach, describe, expect, it } from 'vitest';

import { createCatchUp } from '../src/host/catch-up';
import { applyStoredChanges } from '../src/host/local-conversation-cache';
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

const entry = (id: string, revision: number, body: string) => ({
  channelId: 'c1',
  revision,
  message: { id, at: '2026-11-05T00:00:00Z', author: { kind: 'human' as const }, body },
});

describe('applying change pages out of order', () => {
  async function seeded() {
    const store = await storeWith([]);
    await store.write(async (tx) => {
      await tx.run(
        'insert into messages (channel_id, id, revision, entry, purged) values (?, ?, ?, ?, 0)',
        ['c1', 'm1', 1, JSON.stringify(entry('m1', 1, 'secret'))],
      );
      await tx.run('insert into cursors (channel_id, epoch, seq) values (?, ?, ?)', [
        'c1',
        'e1',
        5,
      ]);
    });
    return store;
  }
  const body = async (store: LocalStore) =>
    JSON.parse(
      (await store.get<{ entry: string }>('select entry from messages where id = ?', ['m1']))!
        .entry,
    ).message.body;
  const cursor = (store: LocalStore) =>
    store.get('select epoch, seq from cursors where channel_id = ?', ['c1']);

  it('keeps a purge when an older page arrives after a newer one', async () => {
    const store = await seeded();
    await store.write((tx) =>
      applyStoredChanges(tx, 'c1', {
        upserts: [],
        tombstones: ['m1'],
        removed: [],
        cursor: { epoch: 'e1', seq: 9 },
      }),
    );
    await store.write((tx) =>
      applyStoredChanges(tx, 'c1', {
        upserts: [entry('m1', 1, 'secret')],
        tombstones: [],
        removed: [],
        cursor: { epoch: 'e1', seq: 7 },
      }),
    );
    expect(await body(store)).toBe('');
    expect(await cursor(store)).toEqual({ epoch: 'e1', seq: 9 });
  });

  it('skips a page from an epoch the store has already moved past', async () => {
    const store = await seeded();
    await store.write((tx) =>
      tx.run("update cursors set epoch = 'e2', seq = 1 where channel_id = 'c1'"),
    );
    await store.write((tx) =>
      applyStoredChanges(tx, 'c1', {
        upserts: [entry('m1', 1, 'old epoch')],
        tombstones: [],
        removed: [],
        cursor: { epoch: 'e1', seq: 50 },
      }),
    );
    expect(await body(store)).toBe('secret');
    expect(await cursor(store)).toEqual({ epoch: 'e2', seq: 1 });
  });

  it('applies a page when no cursor is stored yet', async () => {
    const store = await seeded();
    await store.write((tx) => tx.run("delete from cursors where channel_id = 'c1'"));
    await store.write((tx) =>
      applyStoredChanges(tx, 'c1', {
        upserts: [entry('m1', 1, 'edited')],
        tombstones: [],
        removed: [],
        cursor: { epoch: 'e1', seq: 6 },
      }),
    );
    expect(await body(store)).toBe('edited');
  });
});
