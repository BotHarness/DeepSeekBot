import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createLocalConversationCache,
  redactLocalConversations,
} from '../src/host/local-conversation-cache';
import { searchStoredMessages } from '../src/host/local-message-search';
import { LOCAL_STORE_MIGRATIONS, openLocalStore, type LocalStore } from '../src/host/local-store';
import {
  mergeMessageHits,
  searchLocalMessages,
  type MessageSearchHit,
} from '../src/host/message-search';
import type { JournalEntry } from '../src/host/wire';
import { nodeSqlConnection } from './node-sql-connection';

const CHANNEL = 'group-notes';
const KEY = JSON.stringify(['computer', 'host-a', 'channel:group-notes']);
const stores: LocalStore[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

async function open(path = ':memory:', migrations = LOCAL_STORE_MIGRATIONS) {
  const store = await openLocalStore(nodeSqlConnection(path), migrations);
  stores.push(store);
  return store;
}

const entry = (revision: number, id: string, body: string): JournalEntry => ({
  channelId: CHANNEL,
  revision,
  message: { id, at: `2026-11-05T00:00:0${revision}Z`, author: { kind: 'human' }, body },
});

async function seeded() {
  const store = await open();
  const cache = createLocalConversationCache({ store: async () => store });
  cache.write(KEY, {
    entries: [
      entry(1, 'm1', '下周一版本发布，记得准备说明'),
      entry(2, 'm2', 'Release notes are in the shared folder'),
      entry(3, 'm3', '发布前再跑一次回归'),
      entry(4, 'm4', 'Lunch?'),
    ],
    hasOlder: false,
  });
  await cache.flush();
  return { store, cache };
}

const ids = (hits: { entry: JournalEntry }[]) => hits.map((hit) => hit.entry.message.id);

describe('local message search', () => {
  it('finds synced Chinese and English messages, newest first', async () => {
    const { store } = await seeded();
    expect(ids(await searchStoredMessages(store, '发布', 20))).toEqual(['m3', 'm1']);
    expect(ids(await searchStoredMessages(store, '版本发布', 20))).toEqual(['m1']);
    expect(ids(await searchStoredMessages(store, 'release NOTES', 20))).toEqual(['m2']);
    expect(ids(await searchStoredMessages(store, '100%', 20))).toEqual([]);
    const [hit] = await searchStoredMessages(store, 'shared', 20);
    expect(hit).toMatchObject({
      channelId: CHANNEL,
      snippet: 'Release notes are in the shared folder',
    });
  });

  it('drops purged, blanked and removed messages from the index', async () => {
    const { store, cache } = await seeded();
    await redactLocalConversations(store, [{ channelId: CHANNEL, messageId: 'm1' }]);
    cache.applyChanges!(KEY, CHANNEL, {
      upserts: [entry(2, 'm2', 'Notes moved to the wiki')],
      tombstones: ['m3'],
      removed: [],
      cursor: { epoch: 'e1', seq: 2 },
    });
    await cache.flush();
    expect(ids(await searchStoredMessages(store, '发布', 20))).toEqual([]);
    expect(ids(await searchStoredMessages(store, 'release', 20))).toEqual([]);
    expect(ids(await searchStoredMessages(store, 'wiki', 20))).toEqual(['m2']);
    cache.applyChanges!(KEY, CHANNEL, {
      upserts: [],
      tombstones: [],
      removed: ['m2'],
      cursor: { epoch: 'e1', seq: 3 },
    });
    await cache.flush();
    expect(ids(await searchStoredMessages(store, 'wiki', 20))).toEqual([]);
    expect(await store.all('select n from search_rows order by n')).toHaveLength(3);
  });

  it('indexes rows stored before the search migration', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'message-search-'));
    directories.push(directory);
    const path = join(directory, 'host.db');
    const old = await open(path, LOCAL_STORE_MIGRATIONS.slice(0, -1));
    await old.write((tx) =>
      tx.run('insert into messages (channel_id, id, revision, entry) values (?, ?, ?, ?)', [
        CHANNEL,
        'm1',
        1,
        JSON.stringify(entry(1, 'm1', '旧消息里的关键词')),
      ]),
    );
    await old.close();
    stores.splice(0);
    const store = await open(path);
    expect(ids(await searchStoredMessages(store, '关键词', 20))).toEqual(['m1']);
  });
});

const hit = (
  hostId: string,
  messageId: string,
  at: string,
  snippet = messageId,
): MessageSearchHit => ({
  hostId,
  channelId: CHANNEL,
  messageId,
  at,
  author: { kind: 'human' },
  snippet,
});

describe('merging local and Host hits', () => {
  it('keeps one hit per message, prefers the Host snippet and skips a failing store', async () => {
    const local = await searchLocalMessages(
      [{ hostId: 'home' }, { hostId: 'broken' }],
      '发布',
      async (hostId) => {
        if (hostId === 'broken') throw new Error('closed');
        return [
          hit('home', 'm1', '2026-11-05T00:00:01Z', 'local'),
          hit('home', 'm3', '2026-11-05T00:00:03Z'),
        ];
      },
    );
    const merged = mergeMessageHits(local, [
      hit('home', 'm1', '2026-11-05T00:00:01Z', 'host'),
      hit('home', 'm9', '2026-11-05T00:00:09Z'),
    ]);
    expect(merged.map((item) => [item.messageId, item.snippet])).toEqual([
      ['m9', 'm9'],
      ['m3', 'm3'],
      ['m1', 'host'],
    ]);
  });
});
