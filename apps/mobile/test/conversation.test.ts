import { afterEach, describe, expect, it } from 'vitest';

import { createHostClient, type HostClient } from '../src/host/client';
import {
  createConversation,
  type CachedConversation,
  type Conversation,
  type ConversationSnapshot,
} from '../src/host/conversation';
import { FakeHost, type FakeChannel } from './fake-host';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const SLUG = 'bot-59296301f8d044d2b022d8784c5ed3fe';
const DM = `dm-${SLUG}`;

let client: HostClient | undefined;
let conversation: Conversation | undefined;
afterEach(() => {
  conversation?.stop();
  client?.stop();
});

function seed(channel: FakeChannel, count: number): void {
  for (let index = 1; index <= count; index += 1)
    channel.append(
      index % 2 === 1
        ? { id: `human-${index}`, body: `question ${index}`, author: { kind: 'human' } }
        : { id: `bot-${index}`, body: `answer ${index}`, author: { kind: 'bot', slug: SLUG } },
      false,
    );
}

function open(
  host: FakeHost,
  {
    noChannel,
    ...options
  }: Partial<Parameters<typeof createConversation>[0]> & {
    noChannel?: true;
  } = {},
): Conversation {
  client = createHostClient({
    route: ROUTE,
    token: host.token,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  let next = 0;
  conversation = createConversation({
    host: client,
    botSlug: SLUG,
    displayName: 'Mobile Probe',
    ...(noChannel ? {} : { channelId: DM }),
    pageSize: 10,
    olderPageSize: 8,
    messageId: () => `human-00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
    ...options,
  });
  conversation.start();
  return conversation;
}

async function until(
  target: Conversation,
  accept: (snapshot: ConversationSnapshot) => boolean,
): Promise<ConversationSnapshot> {
  for (let tries = 0; tries < 300; tries += 1) {
    const snapshot = target.getSnapshot();
    if (accept(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out; last snapshot ${JSON.stringify(target.getSnapshot())}`);
}

const ids = (snapshot: ConversationSnapshot) => snapshot.messages.map((message) => message.id);
const revisions = (snapshot: ConversationSnapshot) =>
  snapshot.messages.map((message) => message.revision);

function contiguous(snapshot: ConversationSnapshot): boolean {
  const list = revisions(snapshot).filter((value) => value !== undefined);
  return list.every((value, index) => index === 0 || value === list[index - 1]! + 1);
}

describe('DM conversation', () => {
  it('opens on the Host tail page and pages older history without gaps or duplicates', async () => {
    const host = new FakeHost();
    seed(host.channel(DM), 25);
    const target = open(host);
    const live = await until(target, (s) => s.status === 'live');
    expect(revisions(live)).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);
    expect(live.hasOlder).toBe(true);
    await target.loadOlder();
    const once = target.getSnapshot();
    expect(revisions(once)[0]).toBe(8);
    await target.loadOlder();
    const all = target.getSnapshot();
    expect(revisions(all)).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
    expect(all.hasOlder).toBe(false);
    expect(new Set(ids(all)).size).toBe(25);
    await target.loadOlder();
    expect(host.calls.filter((call) => call.method === 'channelJournalPage')).toHaveLength(2);
    expect(host.calls.find((call) => call.method === 'channelJournalPage')?.args).toEqual({
      channelId: DM,
      through: 25,
      before: 16,
      limit: 8,
    });
  });

  it('shows the cached page at once, then reconciles it with the Host window', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 12);
    const stale = channel.page(9, undefined, 5)!;
    const written: CachedConversation[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const target = open(host, {
      cache: {
        read: async () => ({ entries: stale.entries, hasOlder: true }),
        write: (_slug, value) => written.push(value),
      },
      host: {
        call: (method, args) => client!.call(method, args),
        follow: (endpoint, args, handlers) => {
          let cancel: (() => void) | undefined;
          void gate.then(() => {
            cancel = client!.follow(endpoint, args, handlers);
          });
          return () => cancel?.();
        },
      },
    });
    const cached = await until(target, (s) => s.fromCache);
    expect(revisions(cached)).toEqual([5, 6, 7, 8, 9]);
    expect(cached.status).toBe('opening');
    release();
    const live = await until(target, (s) => s.status === 'live' && !s.fromCache);
    expect(revisions(live)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(contiguous(live)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(written.at(-1)?.entries.map((entry) => entry.revision)).toEqual(revisions(live));
  });

  it('sends with a phone message id: pending, then sent, then the journal entry', async () => {
    const host = new FakeHost();
    seed(host.channel(DM), 2);
    let releaseSend: () => void = () => {};
    host.methods.set(
      'channelSend',
      (args) =>
        new Promise((resolve) => {
          releaseSend = () => {
            const channel = host.channel(DM);
            channel.append({ id: String(args['messageId']), body: String(args['body']) }, false);
            resolve({ message: channel.messages.at(-1) });
          };
        }),
    );
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    const id = target.send('mobile tracer DM 7f3a');
    expect(target.getSnapshot().messages.at(-1)).toMatchObject({
      id,
      body: 'mobile tracer DM 7f3a',
      delivery: 'pending',
    });
    await until(target, () => host.calls.some((call) => call.method === 'channelSend'));
    releaseSend();
    const sent = await until(target, (s) => s.messages.at(-1)?.delivery === 'committed');
    expect(sent.messages.at(-1)?.revision).toBeUndefined();
    host.channel(DM).emit({
      type: 'entry',
      entry: { channelId: DM, message: host.channel(DM).messages.at(-1)!, revision: 3 },
    });
    const joined = await until(target, (s) => s.messages.at(-1)?.revision === 3);
    expect(ids(joined).filter((value) => value === id)).toHaveLength(1);
    expect(host.calls.find((call) => call.method === 'channelSend')?.args).toEqual({
      channelId: DM,
      body: 'mobile tracer DM 7f3a',
      messageId: id,
    });
  });

  it('marks a send failed and retries with the same id, so the Host commits it once', async () => {
    const host = new FakeHost();
    host.channel(DM);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    host.failing.add('channelSend');
    const id = target.send('retry me');
    const failed = await until(target, (s) => s.messages.at(-1)?.delivery === 'failed');
    expect(failed.messages.at(-1)?.error).toBeTruthy();
    host.failing.delete('channelSend');
    target.retry(id);
    expect(target.getSnapshot().messages.at(-1)?.delivery).toBe('pending');
    await until(target, (s) => s.messages.at(-1)?.revision === 1);
    target.retry(id);
    await host.carrier.request(`${ROUTE}/api/botharness/channelSend`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'replay',
        method: 'botharness/channelSend',
        payload: { args: { channelId: DM, body: 'retry me', messageId: id } },
      }),
      signal: new AbortController().signal,
    });
    expect(host.channel(DM).messages.filter((message) => message.id === id)).toHaveLength(1);
    expect(ids(target.getSnapshot()).filter((value) => value === id)).toHaveLength(1);
  });

  it('streams a Bot draft live and replaces it with the committed reply', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 1);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    const draft = {
      channelId: DM,
      draftId: 'draft-1',
      attemptId: 'attempt-1',
      botSlug: SLUG,
      revision: 1,
    };
    channel.emit({
      type: 'notification',
      notification: { kind: 'draft', draft: { ...draft, body: 'Hel' } },
    });
    await until(target, (s) => s.drafts[0]?.body === 'Hel');
    channel.emit({
      type: 'notification',
      notification: { kind: 'draft', draft: { ...draft, body: 'Hello **there**' } },
    });
    await until(target, (s) => s.drafts[0]?.body === 'Hello **there**');
    channel.append({
      id: 'bot-reply',
      body: 'Hello **there**',
      author: { kind: 'bot', slug: SLUG },
    });
    const done = await until(target, (s) => s.messages.at(-1)?.id === 'bot-reply');
    expect(done.drafts).toEqual([]);
    expect(done.messages.at(-1)).toMatchObject({ author: 'bot', delivery: 'committed' });
  });

  it('resumes from the last revision after the connection drops, with nothing lost or doubled', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 4);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    host.kill();
    await until(target, (s) => s.status === 'interrupted');
    for (let index = 5; index <= 18; index += 1)
      channel.append({ id: `away-${index}`, body: `away ${index}` }, false);
    host.restart();
    const back = await until(target, (s) => s.status === 'live' && s.messages.length === 18);
    expect(revisions(back)).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
    expect(new Set(ids(back)).size).toBe(18);
    expect(host.calls.filter((call) => call.method === 'channelJournalPage').at(-1)?.args).toEqual({
      channelId: DM,
      through: 8,
      limit: 4,
    });
    channel.append({ id: 'after', body: 'after' });
    await until(target, (s) => s.messages.at(-1)?.revision === 19);
    expect(channel.followerCount).toBe(1);
  });

  it('repairs a gap between live entries through the journal', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 3);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    channel.append({ id: 'skipped-4', body: 'four' }, false);
    channel.append({ id: 'seen-5', body: 'five' });
    const repaired = await until(target, (s) => s.messages.at(-1)?.revision === 5);
    expect(ids(repaired).slice(-2)).toEqual(['skipped-4', 'seen-5']);
    expect(contiguous(repaired)).toBe(true);
    channel.emit({
      type: 'entry',
      entry: { channelId: DM, message: channel.messages[4]!, revision: 5 },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(target.getSnapshot().messages).toHaveLength(5);
  });

  it('creates the DM through channelDm when the Roster has none yet', async () => {
    const host = new FakeHost();
    const target = open(host, { noChannel: true });
    await until(target, (s) => s.status === 'live');
    expect(host.calls[0]).toMatchObject({ method: 'channelDm', args: { slug: SLUG } });
    target.send('first');
    await until(target, (s) => s.messages.at(-1)?.revision === 1);
  });

  it('reports a refused Channel and stops following it', async () => {
    const host = new FakeHost();
    const target = open(host, { channelId: 'dm-missing' });
    const refused = await until(target, (s) => s.status === 'refused');
    expect(refused.reason).toBe('Unknown Channel');
  });

  it('cancels its stream when the screen closes', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    expect(channel.followerCount).toBe(1);
    target.stop();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(channel.followerCount).toBe(0);
  });
});
