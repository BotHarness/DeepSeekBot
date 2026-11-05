import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  closeHostStore,
  deleteHostStore,
  hostStore,
  hostStoreSize,
  installHostStoreOpener,
} from '../src/host/host-store';
import { redactLocalConversations } from '../src/host/local-conversation-cache';
import { localStoreName, openLocalStore } from '../src/host/local-store';
import { nodeSqlConnection } from './node-sql-connection';

const directory = mkdtempSync(join(tmpdir(), 'host-store-'));
let opens = 0;

installHostStoreOpener({
  open: (hostId) => {
    opens += 1;
    return openLocalStore(nodeSqlConnection(join(directory, localStoreName(hostId))));
  },
  remove: async (hostId) => {
    for (const suffix of ['', '-wal', '-shm'])
      rmSync(join(directory, localStoreName(hostId) + suffix), { force: true });
  },
  size: (hostId) => {
    const path = join(directory, localStoreName(hostId));
    return existsSync(path) ? statSync(path).size : 0;
  },
});

afterEach(async () => {
  await closeHostStore('host-a');
  await closeHostStore('host-b');
});

const message = (id: string, body: string) =>
  JSON.stringify({
    channelId: 'dm-x',
    revision: 1,
    message: { id, at: '2026-11-05T00:00:00Z', author: { kind: 'human' }, body },
  });

async function seed(hostId: string, body: string) {
  const store = await hostStore(hostId);
  await store.write((tx) =>
    tx.run(
      'insert or replace into messages (channel_id, id, revision, entry) values (?, ?, ?, ?)',
      ['dm-x', 'm1', 1, message('m1', body)],
    ),
  );
  return store;
}

it('opens one store per Host and reuses it', async () => {
  const before = opens;
  const [a, again] = await Promise.all([hostStore('host-a'), hostStore('host-a')]);
  expect(a).toBe(again);
  expect(opens).toBe(before + 1);
  expect(await hostStore('host-b')).not.toBe(a);
});

it("redacts a purge only in that Host's store", async () => {
  const a = await seed('host-a', 'secret a');
  const b = await seed('host-b', 'secret b');
  await redactLocalConversations(a, [{ channelId: 'dm-x', messageId: 'm1' }]);
  expect(await a.get('select purged from messages')).toEqual({ purged: 1 });
  expect(await b.get('select purged from messages')).toEqual({ purged: 0 });
});

it('deletes only that Host, and a new pairing starts empty', async () => {
  await seed('host-a', 'a');
  await seed('host-b', 'b');
  expect(hostStoreSize('host-a')).toBeGreaterThan(0);
  await deleteHostStore('host-a');
  expect(hostStoreSize('host-a')).toBe(0);
  expect(await (await hostStore('host-a')).all('select id from messages')).toEqual([]);
  expect(await (await hostStore('host-b')).all('select id from messages')).toHaveLength(1);
});

it('reports zero size for a Host with no store', () => {
  expect(hostStoreSize('host-never')).toBe(0);
});
