import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostClient, type HostClient } from '@botharness/host-client/client';
import { createConversation, type Conversation } from '@botharness/host-client/conversation';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';

import { DM, ROUTE, SLUG, until } from './conversation-fixtures';

let client: HostClient | undefined;

let conversation: Conversation | undefined;

afterEach(() => {
  conversation?.stop();
  client?.stop();
  vi.useRealTimers();
});

function open(
  host: FakeHost,
  {
    noChannel,
    ...options
  }: Partial<Parameters<typeof createConversation>[0]> & { noChannel?: true } = {},
): Conversation {
  client = createHostClient({
    routes: [ROUTE],
    credential: host.credential,
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

describe('group Channel conversation', () => {
  const GROUP = 'launch-team';

  function openGroup(host: FakeHost, cache?: Parameters<typeof createConversation>[0]['cache']) {
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      carrier: host.carrier,
      backoff: () => 5,
      timeoutMs: 200,
    });
    client.start();
    conversation = createConversation({
      host: client,
      channelId: GROUP,
      cacheKey: `channel:${GROUP}`,
      pageSize: 10,
      messageId: () => 'human-00000000-0000-4000-8000-000000000001',
      ...(cache === undefined ? {} : { cache }),
    });
    conversation.start();
    return conversation;
  }

  it('follows the group journal, keeps who wrote each Bot message and sends into the Channel', async () => {
    const host = new FakeHost();
    const channel = host.channel(GROUP);
    channel.append({ id: 'h-1', body: 'Plan the launch', author: { kind: 'human' } }, false);
    channel.append({ id: 'b-1', body: 'Drafting', author: { kind: 'bot', slug: 'ada' } }, false);
    channel.append({ id: 'b-2', body: 'Reviewing', author: { kind: 'bot', slug: 'grace' } }, false);
    const keys: string[] = [];
    const target = openGroup(host, {
      read: async (key) => {
        keys.push(key);
        return undefined;
      },
      write: (key) => keys.push(key),
    });
    const live = await until(target, (s) => s.status === 'live');
    expect(live.messages.map((message) => [message.author, message.bot])).toEqual([
      ['human', undefined],
      ['bot', 'ada'],
      ['bot', 'grace'],
    ]);
    target.send('ship it');
    await until(target, (s) => s.messages.at(-1)?.delivery === 'committed');
    expect(host.calls.find((call) => call.method === 'channelSend')?.args).toMatchObject({
      channelId: GROUP,
      body: 'ship it',
    });
    expect(host.calls.some((call) => call.method === 'channelDm')).toBe(false);
    expect(new Set(keys)).toEqual(new Set([`channel:${GROUP}`]));
  });

  it('streams drafts from several Bots side by side', async () => {
    const host = new FakeHost();
    const channel = host.channel(GROUP);
    const target = openGroup(host);
    await until(target, (s) => s.status === 'live');
    for (const botSlug of ['ada', 'grace'])
      channel.emit({
        type: 'notification',
        notification: {
          kind: 'draft',
          draft: {
            channelId: GROUP,
            draftId: `draft-${botSlug}`,
            attemptId: `attempt-${botSlug}`,
            botSlug,
            body: `${botSlug} is writing`,
            revision: 1,
          },
        },
      });
    const both = await until(target, (s) => s.drafts.length === 2);
    expect(both.drafts.map((draft) => draft.botSlug)).toEqual(['ada', 'grace']);
  });
});

describe('group Channel mentions on send', () => {
  it('keeps identity and ranges in cached history, live entries and optimistic messages', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    const mentions = [{ botSlug: 'stable-ada-id', label: 'Ada', start: 0, end: 4 }];
    channel.append({ id: 'history', body: '@Ada **plan**', mentions }, false);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const target = open(host, {
      cache: {
        read: async () => ({ entries: channel.page(1, undefined, 10)!.entries, hasOlder: false }),
        write: () => {},
      },
      host: {
        call: (method, args) => client!.call(method, args),
        upload: (name, data) => client!.upload(name, data),
        resource: (path) => client!.resource(path),
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
    expect(cached.messages[0]).toMatchObject({ mentions });
    release();
    await until(target, (s) => s.status === 'live' && !s.fromCache);
    expect(target.getSnapshot().messages[0]).toMatchObject({ mentions });
    channel.append({ id: 'live', body: '@Ada **plan**', mentions });
    const live = await until(target, (s) => s.messages.some((message) => message.id === 'live'));
    expect(live.messages.at(-1)).toMatchObject({ mentions });
    target.send('@Ada plan it', [], { mentions });
    expect(target.getSnapshot().messages.at(-1)).toMatchObject({ mentions, delivery: 'pending' });
  });

  it('passes selected mention tokens to channelSend', async () => {
    const host = new FakeHost();
    host.channel('launch-team');
    client = createHostClient({
      routes: [ROUTE],
      credential: host.credential,
      carrier: host.carrier,
      backoff: () => 5,
      timeoutMs: 200,
    });
    client.start();
    conversation = createConversation({ host: client, channelId: 'launch-team' });
    conversation.start();
    await until(conversation, (s) => s.status === 'live');
    const mentions = [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }];
    conversation.send('@Ada plan it', [], { mentions });
    await until(conversation, (s) => s.messages.at(-1)?.delivery === 'committed');
    expect(host.calls.find((call) => call.method === 'channelSend')?.args).toMatchObject({
      channelId: 'launch-team',
      body: '@Ada plan it',
      mentions,
    });
  });
});
