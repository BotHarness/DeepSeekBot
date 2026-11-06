import { afterEach, describe, expect, it } from 'vitest';

import { createHostClient, type HostClient } from '../src/host/client';
import {
  createConversation,
  type CachedConversation,
  type Conversation,
  type ConversationSnapshot,
} from '../src/host/conversation';
import { FakeHost } from './fake-host';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const SLUG = 'bot-59296301f8d044d2b022d8784c5ed3fe';
const DM = `dm-${SLUG}`;

let client: HostClient | undefined;
let conversation: Conversation | undefined;
afterEach(() => {
  conversation?.stop();
  client?.stop();
  client = undefined;
});

function memoryCache() {
  const store = new Map<string, CachedConversation>();
  return {
    store,
    read: async (key: string) => structuredClone(store.get(key)),
    write: (key: string, value: CachedConversation) => store.set(key, structuredClone(value)),
  };
}

function open(host: FakeHost, cache: ReturnType<typeof memoryCache>): Conversation {
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
    cacheKey: `computer:${host.hostId}:${SLUG}`,
    cache,
    pageSize: 10,
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

const settled = () => new Promise((resolve) => setTimeout(resolve, 450));

async function warm(host: FakeHost, count = 6) {
  const channel = host.channel(DM);
  for (let index = 1; index <= count; index += 1)
    channel.append({ id: `m${index}`, body: `body ${index}`, author: { kind: 'human' } }, false);
  const cache = memoryCache();
  const first = open(host, cache);
  await until(first, (s) => s.status === 'live' && s.messages.length === count);
  await settled();
  first.stop();
  expect([...cache.store.values()][0]?.changes).toBeDefined();
  return { channel, cache };
}

const bodies = (snapshot: ConversationSnapshot) =>
  Object.fromEntries(snapshot.messages.map((message) => [message.id, message.body]));

describe('opening a cached conversation with a change cursor', () => {
  it('sends no message bodies when nothing changed', async () => {
    const host = new FakeHost();
    const { channel, cache } = await warm(host);
    channel.bodiesSent = 0;
    const again = open(host, cache);
    const snapshot = await until(again, (s) => s.status === 'live' && !s.fromCache);
    expect(snapshot.messages).toHaveLength(6);
    expect(channel.bodiesSent).toBe(0);
    expect(channel.follows.at(-1)).toMatchObject({ limit: 0 });
  });

  it('applies every change made while it was closed, and fetches only those', async () => {
    const host = new FakeHost();
    const { channel, cache } = await warm(host);
    channel.edit('m2', { body: 'edited while away' });
    channel.edit('m3', {
      reactions: [{ emoji: '👍', actor: { kind: 'human' }, at: '2026-11-05T00:00:00Z' }],
    } as never);
    channel.purge('m4');
    channel.append({ id: 'm7', body: 'new while away', author: { kind: 'human' } }, false);
    channel.bodiesSent = 0;
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
    expect(snapshot.messages.find((m) => m.id === 'm3')?.reactions?.[0]).toMatchObject({
      emoji: '👍',
    });
    expect(channel.bodiesSent).toBeLessThanOrEqual(5);
  });

  it('refetches the tail when the Host starts a new epoch', async () => {
    const host = new FakeHost();
    const { channel, cache } = await warm(host);
    channel.edit('m1', { body: 'changed before the reset' });
    host.log.rotate();
    const again = open(host, cache);
    const snapshot = await until(
      again,
      (s) => s.status === 'live' && !s.fromCache && bodies(s)['m1'] === 'changed before the reset',
    );
    expect(snapshot.messages).toHaveLength(6);
    await settled();
    expect([...cache.store.values()][0]?.changes?.epoch).toBe(host.log.epoch);
  });

  it('keeps working with a Host that has no change log', async () => {
    const host = new FakeHost();
    host.changes = false;
    const { channel, cache } = await (async () => {
      const channel = host.channel(DM);
      for (let index = 1; index <= 3; index += 1)
        channel.append({ id: `m${index}`, body: `body ${index}` }, false);
      const cache = memoryCache();
      const first = open(host, cache);
      await until(first, (s) => s.status === 'live' && s.messages.length === 3);
      await settled();
      first.stop();
      return { channel, cache };
    })();
    expect([...cache.store.values()][0]?.changes).toBeUndefined();
    channel.edit('m1', { body: 'edited' });
    const again = open(host, cache);
    const snapshot = await until(again, (s) => s.status === 'live' && bodies(s)['m1'] === 'edited');
    expect(snapshot.messages).toHaveLength(3);
    expect(channel.follows.at(-1)).toMatchObject({ limit: 10 });
  });

  it('accepts a live message that arrives after a cursor open', async () => {
    const host = new FakeHost();
    const { channel, cache } = await warm(host);
    const again = open(host, cache);
    await until(again, (s) => s.status === 'live' && !s.fromCache);
    channel.append({ id: 'm8', body: 'live', author: { kind: 'human' } });
    await until(again, (s) => s.messages.some((m) => m.id === 'm8'));
  });

  it('reloads the tail when pulling changes fails', async () => {
    const host = new FakeHost();
    const { channel, cache } = await warm(host);
    channel.edit('m2', { body: 'edited while away' });
    host.changesFail = true;
    const again = open(host, cache);
    await until(
      again,
      (s) => s.status === 'live' && !s.fromCache && bodies(s)['m2'] === 'edited while away',
    );
  });

  it('reloads the tail and drops the cursor when changes never finish paging', async () => {
    const host = new FakeHost();
    const { channel, cache } = await warm(host);
    channel.edit('m2', { body: 'edited while away' });
    host.changesStall = true;
    const again = open(host, cache);
    await until(
      again,
      (s) => s.status === 'live' && !s.fromCache && bodies(s)['m2'] === 'edited while away',
    );
    await settled();
    expect([...cache.store.values()][0]?.changes).toBeUndefined();
  });

  it('keeps a restarted session cursor when an older pull fails late', async () => {
    const host = new FakeHost();
    const { channel, cache } = await warm(host);
    channel.sendsChangeHead = false;
    let release!: () => void;
    host.changesHeld = new Promise((resolve) => {
      release = resolve;
    });
    const again = open(host, cache);
    await until(again, () => host.calls.some((call) => call.method === 'channelChanges'));
    again.stop();
    again.start();
    release();
    await until(again, (s) => s.status === 'live' && !s.fromCache);
    await settled();
    channel.append({ id: 'm9', body: 'after the late failure', author: { kind: 'human' } });
    await until(again, (s) => s.messages.some((m) => m.id === 'm9'));
    await settled();
    expect([...cache.store.values()][0]?.changes).toBeDefined();
  });

  it('falls back to a full page when an older Host refuses a zero page size', async () => {
    const host = new FakeHost();
    const { channel, cache } = await warm(host);
    host.refusesEmptyPage = true;
    const again = open(host, cache);
    await until(again, (s) => s.status === 'live' && s.messages.length === 6);
    expect(channel.follows.slice(-2)).toMatchObject([{ limit: 0 }, { limit: 10 }]);
  });
});
