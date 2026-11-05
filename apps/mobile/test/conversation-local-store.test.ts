import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createCatchUp } from '../src/host/catch-up';
import { createHostClient, type HostClient } from '../src/host/client';
import {
  createConversation,
  type CachedConversation,
  type Conversation,
  type ConversationSnapshot,
} from '../src/host/conversation';
import {
  createLocalConversationCache,
  pruneLocalConversations,
  redactLocalConversations,
} from '../src/host/local-conversation-cache';
import { openLocalStore, type LocalStore } from '../src/host/local-store';
import { FakeHost } from './fake-host';
import { nodeSqlConnection } from './node-sql-connection';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const SLUG = 'bot-59296301f8d044d2b022d8784c5ed3fe';
const DM = `dm-${SLUG}`;

let client: HostClient | undefined;
let conversation: Conversation | undefined;
const stores: LocalStore[] = [];
const directories: string[] = [];
afterEach(async () => {
  conversation?.stop();
  client?.stop();
  client = undefined;
  for (const store of stores.splice(0)) await store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function file(): string {
  const directory = mkdtempSync(join(tmpdir(), 'conversation-store-'));
  directories.push(directory);
  return join(directory, 'host.db');
}

async function openStore(path: string): Promise<LocalStore> {
  const store = await openLocalStore(nodeSqlConnection(path));
  stores.push(store);
  return store;
}

async function phone(path: string, legacy?: Map<string, CachedConversation>, openDelayMs = 0) {
  const store = await openStore(path);
  const removed: string[] = [];
  const cache = createLocalConversationCache({
    store: async () => {
      if (openDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, openDelayMs));
      return store;
    },
    ...(legacy === undefined
      ? {}
      : {
          legacy: {
            read: async (key: string) => structuredClone(legacy.get(key)),
            remove: (key: string) => {
              removed.push(key);
              legacy.delete(key);
            },
          },
        }),
  });
  return { store, cache, removed };
}

const keyFor = (host: FakeHost) => JSON.stringify(['computer', host.hostId, SLUG]);

function open(
  host: FakeHost,
  cache: ReturnType<typeof createLocalConversationCache>,
  cacheWaitMs?: number,
) {
  client ??= createHostClient({
    routes: [ROUTE],
    credential: host.credential,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  conversation = createConversation({
    host: client,
    botSlug: SLUG,
    channelId: DM,
    cacheKey: keyFor(host),
    cache,
    pageSize: 10,
    ...(cacheWaitMs === undefined ? {} : { cacheWaitMs }),
  });
  conversation.start();
  return conversation;
}

async function until(
  target: Conversation,
  accept: (snapshot: ConversationSnapshot) => boolean,
): Promise<ConversationSnapshot> {
  for (let tries = 0; tries < 400; tries += 1) {
    const snapshot = target.getSnapshot();
    if (accept(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out; last snapshot ${JSON.stringify(target.getSnapshot())}`);
}

const settle = async (cache: ReturnType<typeof createLocalConversationCache>) => {
  await new Promise((resolve) => setTimeout(resolve, 450));
  await cache.flush();
};

const bodies = (snapshot: ConversationSnapshot) =>
  Object.fromEntries(snapshot.messages.map((message) => [message.id, message.body]));

async function warm(host: FakeHost, path: string, count = 6) {
  const channel = host.channel(DM);
  for (let index = 1; index <= count; index += 1)
    channel.append({ id: `m${index}`, body: `body ${index}`, author: { kind: 'human' } }, false);
  const { cache } = await phone(path);
  const first = open(host, cache);
  await until(first, (s) => s.status === 'live' && s.messages.length === count);
  await settle(cache);
  first.stop();
  client?.stop();
  client = undefined;
  return channel;
}

describe('conversation tail in the local store', () => {
  it('reopens after an app restart from local rows, with the saved cursor and no bodies', async () => {
    const host = new FakeHost();
    const path = file();
    const channel = await warm(host, path);
    for (const store of stores.splice(0)) await store.close();
    const { cache } = await phone(path);
    channel.bodiesSent = 0;
    const again = open(host, cache);
    const live = await until(again, (s) => s.status === 'live' && !s.fromCache);
    expect(bodies(live)['m6']).toBe('body 6');
    expect(channel.bodiesSent).toBe(0);
    expect(channel.follows.at(-1)).toMatchObject({ limit: 0 });
  });

  it('waits for a slow store on a cold start instead of fetching a full page', async () => {
    const host = new FakeHost();
    const path = file();
    const channel = await warm(host, path);
    for (const store of stores.splice(0)) await store.close();
    const slow = await phone(path, undefined, 600);
    const missed = open(host, slow.cache);
    await until(missed, (s) => s.status === 'live');
    expect(channel.follows.at(-1)).toMatchObject({ limit: 10 });
    missed.stop();
    client?.stop();
    client = undefined;
    for (const store of stores.splice(0)) await store.close();
    const patient = await phone(path, undefined, 600);
    channel.bodiesSent = 0;
    const again = open(host, patient.cache, 5000);
    await until(again, (s) => s.status === 'live' && !s.fromCache);
    expect(channel.follows.at(-1)).toMatchObject({ limit: 0 });
    expect(channel.bodiesSent).toBe(0);
  });

  it('applies changes made while closed and writes them to rows', async () => {
    const host = new FakeHost();
    const path = file();
    const channel = await warm(host, path);
    channel.edit('m2', { body: 'edited while away' });
    channel.edit('m3', {
      reactions: [{ emoji: '👍', actor: { kind: 'human' }, at: '2026-11-05T00:00:00Z' }],
    } as never);
    channel.purge('m4');
    channel.append({ id: 'm7', body: 'new while away', author: { kind: 'human' } }, false);
    for (const store of stores.splice(0)) await store.close();
    const { cache, store } = await phone(path);
    const again = open(host, cache);
    const snapshot = await until(
      again,
      (s) => s.status === 'live' && !s.fromCache && s.messages.some((m) => m.id === 'm7'),
    );
    expect(bodies(snapshot)).toMatchObject({
      m2: 'edited while away',
      m4: '',
      m7: 'new while away',
    });
    await settle(cache);
    const rows = await store.all<{ id: string; purged: number; entry: string }>(
      'select id, purged, entry from messages order by revision',
    );
    expect(rows.map((row) => row.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']);
    expect(rows.find((row) => row.id === 'm4')?.purged).toBe(1);
    expect(JSON.parse(rows.find((row) => row.id === 'm2')!.entry).message.body).toBe(
      'edited while away',
    );
    expect(JSON.parse(rows.find((row) => row.id === 'm3')!.entry).message.reactions).toHaveLength(
      1,
    );
  });

  it('updates stored rows older than the open window from the change log', async () => {
    const host = new FakeHost();
    const path = file();
    const channel = await warm(host, path, 3);
    for (const store of stores.splice(0)) await store.close();
    const { cache, store } = await phone(path);
    await store.write(async (tx) => {
      await tx.run(
        "update messages set entry = json_set(entry, '$.message.body', 'stale') where id = 'm1'",
      );
    });
    cache.applyChanges!(keyFor(host), DM, {
      upserts: [
        { channelId: DM, revision: 1, message: { ...channel.messages[0]!, body: 'fresh' } },
      ],
      tombstones: ['m2'],
      removed: ['m3'],
      cursor: { epoch: host.log.epoch, seq: 99 },
    });
    await cache.flush();
    const rows = await store.all<{ id: string; purged: number; entry: string }>(
      'select id, purged, entry from messages order by revision',
    );
    expect(rows.map((row) => row.id)).toEqual(['m1', 'm2']);
    expect(JSON.parse(rows[0]!.entry).message.body).toBe('fresh');
    expect(rows[1]!.purged).toBe(1);
    expect(JSON.parse(rows[1]!.entry).message.body).toBe('');
    expect(await store.get('select seq from cursors where channel_id = ?', [DM])).toEqual({
      seq: 99,
    });
  });

  it('drops old rows and refetches the tail when the Host starts a new epoch', async () => {
    const host = new FakeHost();
    const path = file();
    const channel = await warm(host, path);
    channel.edit('m1', { body: 'changed before the reset' });
    host.log.rotate();
    for (const store of stores.splice(0)) await store.close();
    const { cache, store } = await phone(path);
    const again = open(host, cache);
    await until(
      again,
      (s) => s.status === 'live' && !s.fromCache && bodies(s)['m1'] === 'changed before the reset',
    );
    await settle(cache);
    expect(await store.get('select epoch from cursors where channel_id = ?', [DM])).toEqual({
      epoch: host.log.epoch,
    });
  });

  it('replaces the stored tail and cursor when the Host resets the same epoch', async () => {
    const host = new FakeHost();
    const path = file();
    await warm(host, path);
    for (const store of stores.splice(0)) await store.close();
    const seeded = await openStore(path);
    await seeded.write((tx) =>
      tx.run(
        'insert into messages (channel_id, id, revision, entry, purged) values (?, ?, ?, ?, 0)',
        [
          DM,
          'ghost',
          999,
          JSON.stringify({
            channelId: DM,
            revision: 999,
            message: {
              id: 'ghost',
              at: '2026-11-05T00:00:00Z',
              author: { kind: 'human' },
              body: 'x',
            },
          }),
        ],
      ),
    );
    await seeded.close();
    stores.splice(0);
    host.log.floor = host.log.seq + 1;
    const { cache, store } = await phone(path);
    const again = open(host, cache);
    await until(again, (s) => s.status === 'live' && !s.fromCache);
    await settle(cache);
    const rows = await store.all<{ id: string }>(
      'select id from messages where channel_id = ? order by revision',
      [DM],
    );
    expect(rows.map((row) => row.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
    expect(await store.get('select epoch, seq from cursors where channel_id = ?', [DM])).toEqual({
      epoch: host.log.epoch,
      seq: host.log.seq,
    });
  });

  it('keeps two paired Hosts apart', async () => {
    const pathA = file();
    const pathB = file();
    const a = await openStore(pathA);
    const b = await openStore(pathB);
    const cache = createLocalConversationCache({
      store: async (hostId) => (hostId === 'host-a' ? a : b),
    });
    const entry = (body: string) => ({
      channelId: DM,
      revision: 1,
      message: { id: 'm1', at: '2026-11-05T00:00:00Z', author: { kind: 'human' as const }, body },
    });
    cache.write(JSON.stringify(['computer', 'host-a', SLUG]), {
      entries: [entry('from a')],
      hasOlder: false,
    });
    cache.write(JSON.stringify(['computer', 'host-b', SLUG]), {
      entries: [entry('from b')],
      hasOlder: false,
    });
    await cache.flush();
    expect(
      (await cache.read(JSON.stringify(['computer', 'host-a', SLUG])))?.entries[0]?.message.body,
    ).toBe('from a');
    expect(
      (await cache.read(JSON.stringify(['computer', 'host-b', SLUG])))?.entries[0]?.message.body,
    ).toBe('from b');
    expect(await a.all('select id from messages')).toHaveLength(1);
    expect(await b.all('select id from messages')).toHaveLength(1);
  });

  it('imports an old JSON tail once and keeps its cursor', async () => {
    const host = new FakeHost();
    const key = keyFor(host);
    const legacy = new Map<string, CachedConversation>([
      [
        key,
        {
          entries: [
            {
              channelId: DM,
              revision: 1,
              message: {
                id: 'm1',
                at: '2026-11-05T00:00:00Z',
                author: { kind: 'human' },
                body: 'old',
              },
            },
          ],
          hasOlder: false,
          changes: { epoch: 'e-old', seq: 7 },
        },
      ],
    ]);
    const { cache, removed, store } = await phone(file(), legacy);
    expect((await cache.read(key))?.changes).toEqual({ epoch: 'e-old', seq: 7 });
    expect(removed).toEqual([key]);
    expect(legacy.size).toBe(0);
    const again = await cache.read(key);
    expect(again?.entries[0]?.message.body).toBe('old');
    expect(again?.changes).toEqual({ epoch: 'e-old', seq: 7 });
    expect(await store.all('select key from conversation_keys')).toEqual([{ key }]);
  });

  it('reads the old JSON tail when the store cannot open', async () => {
    const key = JSON.stringify(['computer', 'host-a', SLUG]);
    const tail: CachedConversation = {
      entries: [
        {
          channelId: DM,
          revision: 1,
          message: { id: 'm1', at: '2026-11-05T00:00:00Z', author: { kind: 'human' }, body: 'old' },
        },
      ],
      hasOlder: false,
    };
    const removed: string[] = [];
    const warnings: unknown[] = [];
    const cache = createLocalConversationCache({
      store: () => Promise.reject(new Error('disk full')),
      legacy: { read: async () => structuredClone(tail), remove: (k) => removed.push(k) },
      warn: (error) => warnings.push(error),
    });
    expect((await cache.read(key))?.entries[0]?.message.body).toBe('old');
    expect(removed).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('removes the old JSON tail once a fallback read is replaced in the store', async () => {
    const key = JSON.stringify(['computer', 'host-a', SLUG]);
    const tail: CachedConversation = {
      entries: [
        {
          channelId: DM,
          revision: 1,
          message: { id: 'm1', at: '2026-11-05T00:00:00Z', author: { kind: 'human' }, body: 'old' },
        },
      ],
      hasOlder: false,
    };
    const store = await openStore(':memory:');
    let opens = 0;
    const removed: string[] = [];
    const cache = createLocalConversationCache({
      store: () => (opens++ === 0 ? Promise.reject(new Error('busy')) : Promise.resolve(store)),
      legacy: { read: async () => structuredClone(tail), remove: (k) => removed.push(k) },
      warn: () => undefined,
    });
    expect((await cache.read(key))?.entries[0]?.message.body).toBe('old');
    expect(removed).toEqual([]);
    cache.write(key, tail);
    await cache.flush();
    expect(removed).toEqual([key]);
    cache.write(key, tail);
    await cache.flush();
    expect(removed).toEqual([key]);
  });

  it('redacts purged rows and prunes conversations of gone Channels', async () => {
    const store = await openStore(':memory:');
    const cache = createLocalConversationCache({ store: async () => store });
    const groupKey = JSON.stringify(['computer', 'host-a', 'channel:g1']);
    const entry = (channelId: string, id: string) => ({
      channelId,
      revision: 1,
      message: {
        id,
        at: '2026-11-05T00:00:00Z',
        author: { kind: 'human' as const },
        body: 'secret',
      },
    });
    cache.write(JSON.stringify(['computer', 'host-a', SLUG]), {
      entries: [entry(DM, 'm1')],
      hasOlder: false,
    });
    cache.write(groupKey, { entries: [entry('g1', 'g-1')], hasOlder: false });
    await cache.flush();
    await redactLocalConversations(store, [{ channelId: DM, messageId: 'm1' }]);
    const redacted = await store.get<{ purged: number; entry: string }>(
      'select purged, entry from messages where id = ?',
      ['m1'],
    );
    expect(redacted?.purged).toBe(1);
    expect(JSON.parse(redacted!.entry).message).toMatchObject({
      body: '',
      contentPurge: { actor: 'local-human' },
    });
    await pruneLocalConversations(store, (key) => key === 'channel:g1');
    expect(await store.all("select id from messages where channel_id = 'g1'")).toEqual([]);
    expect(await cache.read(groupKey)).toBeUndefined();
  });
});

async function scrollToTop(target: Conversation): Promise<ConversationSnapshot> {
  let snapshot = await until(target, (s) => s.status === 'live' && !s.fromCache);
  while (snapshot.hasOlder) {
    const before = snapshot.messages.length;
    await target.loadOlder();
    snapshot = target.getSnapshot();
    if (snapshot.messages.length === before && snapshot.hasOlder) throw new Error('stuck');
  }
  return snapshot;
}

async function session(host: FakeHost, path: string) {
  for (const store of stores.splice(0)) await store.close();
  conversation?.stop();
  client?.stop();
  client = undefined;
  const { cache, store } = await phone(path);
  return { cache, store, conversation: open(host, cache) };
}

function fill(host: FakeHost, from: number, to: number) {
  const channel = host.channel(DM);
  for (let index = from; index <= to; index += 1)
    channel.append({ id: `m${index}`, body: `body ${index}`, author: { kind: 'human' } }, false);
  return channel;
}

describe('older history in the local store', () => {
  it('scrolls back over synced history without Host requests, with edits and purges applied', async () => {
    const host = new FakeHost();
    const path = file();
    const channel = fill(host, 1, 120);
    const first = await session(host, path);
    expect((await scrollToTop(first.conversation)).messages).toHaveLength(120);
    await settle(first.cache);
    channel.edit('m5', { body: 'edited while away' });
    channel.purge('m3');
    const second = await session(host, path);
    await until(second.conversation, (s) => s.status === 'live' && !s.fromCache);
    channel.bodiesSent = 0;
    const top = await scrollToTop(second.conversation);
    expect(channel.bodiesSent).toBe(0);
    expect(top.messages).toHaveLength(120);
    expect(bodies(top)).toMatchObject({ m3: '', m5: 'edited while away', m120: 'body 120' });
  });

  it('stores messages that arrived while closed from the change pull, with no refetch', async () => {
    const host = new FakeHost();
    const path = file();
    const channel = fill(host, 1, 60);
    const first = await session(host, path);
    await scrollToTop(first.conversation);
    await settle(first.cache);
    fill(host, 61, 400);
    const second = await session(host, path);
    await until(second.conversation, (s) => s.status === 'live' && !s.fromCache);
    channel.bodiesSent = 0;
    const top = await scrollToTop(second.conversation);
    expect(top.messages.map((message) => message.id)).toEqual(
      Array.from({ length: 400 }, (_, index) => `m${index + 1}`),
    );
    expect(channel.bodiesSent).toBe(0);
    await settle(second.cache);
    const spans = await second.store.all('select from_revision, to_revision from gaps');
    expect(spans).toEqual([{ from_revision: 1, to_revision: 400 }]);
    const third = await session(host, path);
    await until(third.conversation, (s) => s.status === 'live' && !s.fromCache);
    channel.bodiesSent = 0;
    expect((await scrollToTop(third.conversation)).messages).toHaveLength(400);
    expect(channel.bodiesSent).toBe(0);
  });

  it('fetches older history from the Host when the store has no range for it', async () => {
    const host = new FakeHost();
    const path = file();
    const channel = fill(host, 1, 40);
    const store = await openStore(path);
    const cache = createLocalConversationCache({ store: async () => store });
    const key = keyFor(host);
    expect(await cache.readOlder!(key, 30, 10)).toBeUndefined();
    const live = open(host, cache);
    channel.bodiesSent = 0;
    const top = await scrollToTop(live);
    expect(top.messages).toHaveLength(40);
    expect(channel.bodiesSent).toBe(40);
  });

  async function heldOlderPage(host: FakeHost) {
    const channel = host.channel(DM);
    let release!: () => void;
    let enter!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const entered = new Promise<void>((resolve) => (enter = resolve));
    host.methods.set('channelJournalPage', async (args) => {
      const page = channel.page(
        args['through'] as number,
        args['before'] as number | undefined,
        args['limit'] as number | undefined,
      );
      if (args['before'] === undefined) return page;
      enter();
      await released;
      return page;
    });
    return { entered, release, restore: () => host.methods.delete('channelJournalPage') };
  }

  const changesCalls = (host: FakeHost) =>
    host.calls.filter((call) => call.method === 'channelChanges').length;

  it('drops an older page that a change pull made stale while it was loading', async () => {
    const host = new FakeHost();
    const path = file();
    const channel = fill(host, 1, 40);
    const synced = await session(host, path);
    await until(synced.conversation, (s) => s.status === 'live' && !s.fromCache);
    await settle(synced.cache);
    const first = await session(host, path);
    await until(first.conversation, (s) => s.status === 'live' && !s.fromCache);
    const held = await heldOlderPage(host);
    const loading = first.conversation.loadOlder();
    await held.entered;
    channel.edit('m25', { body: 'edited during the load' });
    const pulls = changesCalls(host);
    host.kill();
    host.restart();
    for (let tries = 0; tries < 400 && changesCalls(host) === pulls; tries += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(changesCalls(host)).toBeGreaterThan(pulls);
    await until(first.conversation, (s) => s.status === 'live');
    held.release();
    await loading;
    held.restore();
    await scrollToTop(first.conversation);
    expect(bodies(first.conversation.getSnapshot())['m25']).toBe('edited during the load');
    await settle(first.cache);
    const row = await first.store.get<{ entry: string }>(
      'select entry from messages where channel_id = ? and id = ?',
      [DM, 'm25'],
    );
    expect(JSON.parse(row!.entry).message.body).toBe('edited during the load');
  });

  it('drops an older page that a tail reload replaced while it was loading', async () => {
    const host = new FakeHost();
    const path = file();
    fill(host, 1, 40);
    const synced = await session(host, path);
    await until(synced.conversation, (s) => s.status === 'live' && !s.fromCache);
    await settle(synced.cache);
    const first = await session(host, path);
    await until(first.conversation, (s) => s.status === 'live' && !s.fromCache);
    const held = await heldOlderPage(host);
    const loading = first.conversation.loadOlder();
    await held.entered;
    host.log.rotate();
    const pulls = changesCalls(host);
    host.kill();
    host.restart();
    for (let tries = 0; tries < 400 && changesCalls(host) === pulls; tries += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(changesCalls(host)).toBeGreaterThan(pulls);
    await until(first.conversation, (s) => s.status === 'live');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const reloaded = first.conversation.getSnapshot().messages.map((message) => message.id);
    held.release();
    await loading;
    held.restore();
    expect(first.conversation.getSnapshot().messages.map((message) => message.id)).toEqual(
      reloaded,
    );
  });
});

describe('reading synced conversations offline', () => {
  it('opens a synced conversation and its older history without the Host, then catches up once', async () => {
    const host = new FakeHost();
    const path = file();
    const channel = fill(host, 1, 120);
    const synced = await session(host, path);
    await scrollToTop(synced.conversation);
    await settle(synced.cache);
    host.kill();
    const offline = await session(host, path);
    const cached = await until(offline.conversation, (s) => s.messages.length > 0);
    expect(cached.messages.at(-1)?.id).toBe('m120');
    for (let tries = 0; tries < 20 && offline.conversation.getSnapshot().hasOlder; tries += 1)
      await offline.conversation.loadOlder();
    const all = offline.conversation.getSnapshot();
    expect(all.messages).toHaveLength(120);
    expect(all.hasOlder).toBe(false);
    channel.edit('m3', { body: 'edited while offline' });
    channel.append({ id: 'm121', body: 'new while offline', author: { kind: 'human' } }, false);
    host.restart();
    const live = await until(
      offline.conversation,
      (s) => s.status === 'live' && s.messages.some((message) => message.id === 'm121'),
    );
    expect(bodies(live)).toMatchObject({ m3: 'edited while offline', m121: 'new while offline' });
    expect(live.messages.filter((message) => message.id === 'm121')).toHaveLength(1);
    expect(new Set(live.messages.map((message) => message.id)).size).toBe(live.messages.length);
  });

  it('stops automatic paging after an offline miss until the Host is back', async () => {
    const host = new FakeHost();
    const path = file();
    fill(host, 1, 60);
    const synced = await session(host, path);
    await until(synced.conversation, (s) => s.status === 'live' && !s.fromCache);
    await settle(synced.cache);
    host.kill();
    const offline = await session(host, path);
    await until(offline.conversation, (s) => s.messages.length > 0);
    await offline.conversation.loadOlder();
    const missed = offline.conversation.getSnapshot();
    expect(missed).toMatchObject({ hasOlder: true, loadingOlder: false, olderError: true });
    host.restart();
    const live = await until(offline.conversation, (s) => s.status === 'live' && !s.fromCache);
    expect(live.olderError).toBeUndefined();
    await offline.conversation.loadOlder();
    expect(offline.conversation.getSnapshot().messages.length).toBeGreaterThan(
      missed.messages.length,
    );
  });
});

describe('background catch-up', () => {
  function caller(host: FakeHost) {
    const background = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      carrier: host.carrier,
      backoff: () => 5,
      timeoutMs: 200,
    });
    background.start();
    return background;
  }

  it('stores changes for closed conversations so the next open fetches no bodies', async () => {
    const host = new FakeHost();
    const path = file();
    const channel = fill(host, 1, 40);
    const first = await session(host, path);
    await until(first.conversation, (s) => s.status === 'live' && !s.fromCache);
    await settle(first.cache);
    first.conversation.stop();
    fill(host, 41, 70);
    channel.edit('m35', { body: 'edited while closed' });
    channel.purge('m33');
    const background = caller(host);
    const catchUp = createCatchUp({ store: async () => first.store });
    await catchUp.sync({
      hostId: host.hostId,
      call: (method, args) => background.call(method, args),
      liveKeys: () => [],
    });
    background.stop();
    const second = await session(host, path);
    channel.bodiesSent = 0;
    const live = await until(
      second.conversation,
      (s) => s.status === 'live' && !s.fromCache && s.messages.some((m) => m.id === 'm70'),
    );
    expect(channel.bodiesSent).toBe(0);
    expect(bodies(live)).toMatchObject({ m33: '', m35: 'edited while closed', m70: 'body 70' });
  });

  it('leaves conversations that are open to their own change pull', async () => {
    const host = new FakeHost();
    const path = file();
    fill(host, 1, 20);
    const first = await session(host, path);
    await until(first.conversation, (s) => s.status === 'live' && !s.fromCache);
    await settle(first.cache);
    const before = host.calls.filter((call) => call.method === 'channelChanges').length;
    const background = caller(host);
    await createCatchUp({ store: async () => first.store }).sync({
      hostId: host.hostId,
      call: (method, args) => background.call(method, args),
      liveKeys: () => [keyFor(host)],
    });
    background.stop();
    expect(host.calls.filter((call) => call.method === 'channelChanges').length).toBe(before);
  });

  it('takes messages that arrived while closed from the change pull on a bare open', async () => {
    const host = new FakeHost();
    const path = file();
    const channel = fill(host, 1, 40);
    const first = await session(host, path);
    await until(first.conversation, (s) => s.status === 'live' && !s.fromCache);
    await settle(first.cache);
    fill(host, 41, 60);
    const second = await session(host, path);
    channel.bodiesSent = 0;
    const journal = host.calls.filter((call) => call.method === 'channelJournalPage').length;
    const live = await until(
      second.conversation,
      (s) => s.status === 'live' && !s.fromCache && s.messages.some((m) => m.id === 'm60'),
    );
    expect(host.calls.filter((call) => call.method === 'channelJournalPage').length).toBe(journal);
    expect(channel.bodiesSent).toBe(20);
    expect(new Set(live.messages.map((m) => m.id)).size).toBe(live.messages.length);
  });
});
