import { afterEach, describe, expect, it } from 'vitest';

import { createHostClient, type HostClient } from '../src/host/client';
import {
  createConversation,
  type CachedConversation,
  type Conversation,
  type ConversationSnapshot,
} from '../src/host/conversation';
import { installMediaStore, type MediaStore } from '../src/host/media-cache';
import { FakeHost } from './fake-host';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const SLUG = 'bot-59296301f8d044d2b022d8784c5ed3fe';
const DM = `dm-${SLUG}`;
const FILE = 'file:5acf25fb-04b3-4d43-a6c7-a734b3f34807';

let client: HostClient | undefined;
let conversation: Conversation | undefined;
let forgotten: string[] = [];
afterEach(() => {
  conversation?.stop();
  client?.stop();
  client = undefined;
  installMediaStore(undefined);
});

function memoryCache() {
  const store = new Map<string, CachedConversation>();
  return {
    store,
    read: async (key: string) => structuredClone(store.get(key)),
    write: (key: string, value: CachedConversation) => store.set(key, structuredClone(value)),
  };
}

function track(): void {
  forgotten = [];
  const store: MediaStore = {
    uri: () => undefined,
    write: async (key) => key,
    download: async (key) => key,
    entries: () => [],
    remove: () => undefined,
    readSettings: () => undefined,
    writeSettings: () => undefined,
    forget: (prefixes) => forgotten.push(...prefixes),
  };
  installMediaStore(store);
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

const photo = (version: string) => ({
  fileId: FILE,
  name: 'photo.png',
  mime: 'image/png',
  size: 10,
  version,
});

const source = (snapshot: ConversationSnapshot) =>
  snapshot.messages.find((message) => message.id === 'm1')?.attachments[0]?.source?.cacheKey;

describe('attachment changes reach an open conversation', () => {
  it('shows a new version live and forgets the old cached copy', async () => {
    track();
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append({ id: 'm1', body: 'photo', attachments: [photo('v1')] }, false);
    const live = open(host, memoryCache());
    await until(live, (s) => s.status === 'live' && source(s)?.endsWith(':v1') === true);
    channel.setAttachments('m1', [photo('v2')]);
    await until(live, (s) => source(s)?.endsWith(':v2') === true);
    expect(forgotten).toEqual([`${FILE}:v1`]);
  });

  it('shows a cleared file live and forgets its cached copy', async () => {
    track();
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append({ id: 'm1', body: 'photo', attachments: [photo('v1')] }, false);
    const live = open(host, memoryCache());
    await until(live, (s) => s.status === 'live' && source(s) !== undefined);
    channel.setAttachments(
      'm1',
      [],
      [{ name: 'photo.png', mime: 'image/png', size: 10, clearedAt: '2026-11-05T00:00:00Z' }],
    );
    const snapshot = await until(
      live,
      (s) => s.messages.find((m) => m.id === 'm1')?.attachments[0]?.cleared === true,
    );
    expect(source(snapshot)).toBeUndefined();
    expect(forgotten).toEqual([`${FILE}:v1`]);
  });

  it('forgets an old cached version when the change arrives while closed', async () => {
    track();
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append({ id: 'm1', body: 'photo', attachments: [photo('v1')] }, false);
    const cache = memoryCache();
    const first = open(host, cache);
    await until(first, (s) => s.status === 'live' && source(s) !== undefined);
    await new Promise((resolve) => setTimeout(resolve, 450));
    first.stop();
    channel.edit('m1', { attachments: [photo('v2')] });
    const again = open(host, cache);
    await until(
      again,
      (s) => s.status === 'live' && !s.fromCache && source(s)?.endsWith(':v2') === true,
    );
    expect(forgotten).toEqual([`${FILE}:v1`]);
  });
});
