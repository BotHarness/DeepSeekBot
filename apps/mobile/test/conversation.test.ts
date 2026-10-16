import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHostClient, type HostClient } from '../src/host/client';
import {
  createConversation,
  reactable,
  shownInChat,
  type CachedConversation,
  type Conversation,
  type ConversationSnapshot,
} from '../src/host/conversation';
import { FakeHost, type FakeChannel } from './fake-host';
import wire from './fixtures/host-wire.json';
import type { ChannelMessage } from '../../../packages/core/src/channels/channel';

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
  it('presents recorded activity through the live journal and keeps every revision for read tracking', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    for (const entry of wire.activityJournal.page.entries)
      channel.append(entry.message as ChannelMessage, false);
    const live = await until(open(host), (snapshot) => snapshot.status === 'live');
    expect(live.messages.map((message) => message.activity?.kind)).toEqual([
      'channel-post',
      'dm-action',
      'memory',
      'bot-create',
      'departure',
      'turn-stop',
    ]);
    expect(revisions(live)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(live.messages.filter(shownInChat)).toHaveLength(6);
  });
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

  it('marks request cards and the messages that resolve them', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    const bot = { kind: 'bot' as const, slug: SLUG };
    channel.append({
      id: 'ask-tool',
      author: bot,
      body: '请求批准执行 bash',
      toolApprovalRequest: { toolName: 'bash', role: 'orchestrator', cwd: '/w', input: '{}' },
    } as never);
    channel.append({
      id: 'tool-decided',
      body: '已批准这一次工具调用',
      toolApprovalDecision: { requestMessageId: 'ask-tool', outcome: 'allowed-once' },
    } as never);
    channel.append({
      id: 'ask-question',
      author: bot,
      body: 'Which colour?',
      userQuestionRequest: { questions: [{ id: 'c', question: 'Which colour?' }] },
    } as never);
    channel.append({
      id: 'question-cancelled',
      author: bot,
      body: '提问已取消',
      userQuestionResolution: { requestMessageId: 'ask-question', state: 'cancelled' },
    } as never);
    const live = await until(open(host), (snapshot) => snapshot.status === 'live');
    const [tool, decided, ask, cancelled] = live.messages;
    expect(tool?.card).toEqual({ kind: 'tool-approval', channelId: DM, subject: 'bash' });
    expect(decided?.resolves).toEqual({
      requestId: 'ask-tool',
      resolution: { kind: 'tool-approval', outcome: 'allowed-once' },
    });
    expect(ask?.card).toEqual({ kind: 'user-question', channelId: DM, subject: 'Which colour?' });
    expect(cancelled?.resolves).toEqual({
      requestId: 'ask-question',
      resolution: { kind: 'user-question', state: 'cancelled' },
    });
  });

  it('shows recognized activity while hiding the welcome and malformed empty notices', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    const bot = { kind: 'bot' as const, slug: SLUG };
    channel.append({ id: 'answer', author: bot, body: 'done' });
    channel.append({
      id: 'bot-channel-post-1',
      author: bot,
      body: '',
      botChannelPost: { channelId: 'group-launch', messageId: 'm1' },
    } as never);
    channel.append({
      id: 'memory-commit-1',
      author: { kind: 'system' },
      body: '',
      memoryCommit: { botSlug: SLUG, sha: 'abc' },
    } as never);
    channel.append({
      id: 'onboarding-welcome-v1',
      author: { kind: 'system' },
      body: 'Welcome to DeepSeek Bot',
      onboardingWelcome: { version: 1 },
    } as never);
    const live = await until(open(host), (snapshot) => snapshot.status === 'live');
    expect(ids(live)).toEqual([
      'answer',
      'bot-channel-post-1',
      'memory-commit-1',
      'onboarding-welcome-v1',
    ]);
    expect(live.messages.filter(shownInChat).map((message) => message.id)).toEqual([
      'answer',
      'bot-channel-post-1',
    ]);
    expect(live.messages[1]?.activity).toEqual({
      kind: 'channel-post',
      channelId: 'group-launch',
      messageId: 'm1',
      preview: null,
    });
    expect(reactable(live.messages[1]!)).toBe(false);
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

  it('shows reactions from the journal and follows reaction changes live', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 2);
    channel.messages[0]!.reactions = [{ emoji: '👍', actors: [{ kind: 'bot', id: SLUG }] }];
    const target = open(host);
    const live = await until(target, (s) => s.status === 'live');
    expect(live.messages[0]?.reactions).toEqual([
      { emoji: '👍', actors: [{ kind: 'bot', id: SLUG }] },
    ]);
    expect(live.messages[1]).not.toHaveProperty('reactions');
    channel.react('bot-2', [{ emoji: '👀', actors: [{ kind: 'bot', id: SLUG }] }]);
    const seen = await until(target, (s) => s.messages[1]?.reactions !== undefined);
    expect(seen.messages[1]?.reactions?.[0]?.emoji).toBe('👀');
    channel.react('human-1', []);
    const cleared = await until(target, (s) => s.messages[0]?.reactions === undefined);
    expect(cleared.messages[1]?.reactions).toHaveLength(1);
  });

  it('reacts at once, then settles on what the Host stored', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 2);
    channel.messages[1]!.reactions = [{ emoji: '👍', actors: [{ kind: 'bot', id: SLUG }] }];
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    const done = target.react('bot-2', '👍', true);
    expect(target.getSnapshot().messages[1]?.reactions).toEqual([
      {
        emoji: '👍',
        actors: [
          { kind: 'bot', id: SLUG },
          { kind: 'human', id: 'local-human' },
        ],
      },
    ]);
    await done;
    expect(host.calls.find((call) => call.method === 'channelReact')?.args).toEqual({
      channelId: DM,
      messageId: 'bot-2',
      emoji: '👍',
      active: true,
    });
    await target.react('bot-2', '👍', false);
    expect(target.getSnapshot().messages[1]?.reactions).toEqual([
      { emoji: '👍', actors: [{ kind: 'bot', id: SLUG }] },
    ]);
    expect(channel.messages[1]?.reactions).toEqual([
      { emoji: '👍', actors: [{ kind: 'bot', id: SLUG }] },
    ]);
  });

  it('puts a reaction back when the Host refuses it', async () => {
    const host = new FakeHost();
    seed(host.channel(DM), 2);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    host.failing.add('channelReact');
    const done = target.react('bot-2', '🎉', true);
    expect(target.getSnapshot().messages[1]?.reactions?.[0]?.emoji).toBe('🎉');
    await expect(done).rejects.toThrow();
    expect(target.getSnapshot().messages[1]).not.toHaveProperty('reactions');
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

  it('uploads attachments before sending and keeps finished uploads across a retry', async () => {
    const host = new FakeHost();
    host.channel(DM);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    let reads = 0;
    const file = (name: string, text: string) => ({
      name,
      read: async () => {
        reads += 1;
        return new Blob([text]);
      },
    });
    host.failing.add('channelSend');
    const id = target.send('two files', [file('a.txt', 'alpha'), file('b.txt', 'beta')]);
    expect(target.getSnapshot().messages.at(-1)?.attachments).toEqual([
      { key: `${id}:0`, kind: 'file', name: 'a.txt', local: false },
      { key: `${id}:1`, kind: 'file', name: 'b.txt', local: false },
    ]);
    await until(target, (s) => s.messages.at(-1)?.delivery === 'failed');
    expect(host.uploads).toEqual([
      { name: 'a.txt', type: 'application/octet-stream', text: 'alpha' },
      { name: 'b.txt', type: 'application/octet-stream', text: 'beta' },
    ]);
    host.failing.delete('channelSend');
    target.retry(id);
    await until(target, (s) => s.messages.at(-1)?.delivery === 'committed');
    expect(reads).toBe(2);
    expect(host.uploads).toHaveLength(2);
    const sent = host.calls.filter((call) => call.method === 'channelSend').at(-1)?.args;
    expect(sent?.['attachments']).toEqual([
      expect.objectContaining({ name: 'a.txt', size: 5 }),
      expect.objectContaining({ name: 'b.txt', size: 4 }),
    ]);
  });

  it('shows picked files at once and keeps their local copies after the Host commits them', async () => {
    const host = new FakeHost();
    host.channel(DM);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    const id = target.send('', [
      {
        name: 'cat.jpg',
        kind: 'image',
        uri: 'file:///cache/cat.jpg',
        read: async () => new Blob(['jpeg']),
      },
    ]);
    expect(target.getSnapshot().messages.at(-1)?.attachments).toEqual([
      {
        key: `${id}:0`,
        kind: 'image',
        name: 'cat.jpg',
        source: { uri: 'file:///cache/cat.jpg', headers: {} },
        local: true,
      },
    ]);
    const committed = await until(target, (s) => s.messages.at(-1)?.revision === 1);
    expect(committed.messages.at(-1)?.attachments[0]).toMatchObject({
      name: 'cat.jpg',
      size: 4,
      source: { uri: 'file:///cache/cat.jpg', headers: {} },
      local: true,
    });
  });

  it('loads committed attachments and bridged IM media through the device gateway', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append(
      {
        id: 'bot-1',
        author: { kind: 'bot', slug: SLUG },
        body: 'here you go',
        attachments: [
          {
            fileId: 'file:00000000-0000-4000-8000-000000000001',
            name: 'chart.png',
            mime: 'image/png',
            size: 2048,
          },
          {
            hash: `sha256:${'a'.repeat(64)}`,
            name: 'report.pdf',
            mime: 'application/pdf',
            size: 3_500_000,
          },
        ],
      },
      false,
    );
    channel.append(
      {
        id: 'bridged-1',
        author: { kind: 'bridged', source: 'lark' },
        body: '',
        bridgeMedia: { items: [{ id: 'img-1', kind: 'image', name: 'photo.jpg' }] },
        bridgeOrigin: { sourceEventId: 'evt-9' } as never,
      },
      false,
    );
    const target = open(host);
    const live = await until(target, (s) => s.messages.length === 2);
    const headers = { authorization: `Device ${host.credential}` };
    const gateway = `${ROUTE}/botharness-device/api/botharness/attachment?`;
    expect(live.messages[0]?.attachments).toEqual([
      {
        key: 'bot-1:0',
        kind: 'image',
        name: 'chart.png',
        mime: 'image/png',
        size: 2048,
        source: {
          uri: `${gateway}${new URLSearchParams({ channelId: DM, messageId: 'bot-1', fileId: 'file:00000000-0000-4000-8000-000000000001' })}`,
          headers,
        },
        local: false,
      },
      {
        key: 'bot-1:1',
        kind: 'file',
        name: 'report.pdf',
        mime: 'application/pdf',
        size: 3_500_000,
        source: {
          uri: `${gateway}${new URLSearchParams({ hash: `sha256:${'a'.repeat(64)}`, name: 'report.pdf', channelId: DM, messageId: 'bot-1' })}`,
          headers,
        },
        local: false,
      },
    ]);
    expect(live.messages[1]?.attachments).toEqual([
      {
        key: 'bridged-1:bridge:img-1',
        kind: 'image',
        name: 'photo.jpg',
        source: {
          uri: `${gateway}${new URLSearchParams({ channelId: DM, sourceEventId: 'evt-9', attachmentId: 'img-1' })}`,
          headers,
        },
        local: false,
      },
    ]);
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

  it('coalesces streamed draft bodies into few snapshots and keeps the messages array', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 2);
    const target = open(host, { draftDelayMs: 200 });
    const live = await until(target, (s) => s.status === 'live' && s.messages.length === 2);
    const bodies: string[] = [];
    const messageArrays = new Set<unknown>();
    target.subscribe(() => {
      const snapshot = target.getSnapshot();
      bodies.push(snapshot.drafts[0]?.body ?? '');
      messageArrays.add(snapshot.messages);
    });
    const draft = { channelId: DM, draftId: 'draft-1', attemptId: 'attempt-1', botSlug: SLUG };
    const words = Array.from({ length: 20 }, (_, index) => `word${index}`);
    words.forEach((_, index) =>
      channel.emit({
        type: 'notification',
        notification: {
          kind: 'draft',
          draft: { ...draft, revision: index + 1, body: words.slice(0, index + 1).join(' ') },
        },
      }),
    );
    const final = words.join(' ');
    await until(target, (s) => s.drafts[0]?.body === final);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(bodies.length).toBeLessThan(5);
    expect(bodies.filter((body) => body === final)).toHaveLength(1);
    expect([...messageArrays]).toEqual([live.messages]);
    expect(messageArrays.has(live.messages)).toBe(true);
  });

  it('publishes a settled draft at once instead of waiting for the coalescing window', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 1);
    const target = open(host, { draftDelayMs: 60_000 });
    await until(target, (s) => s.status === 'live');
    const seen: number[] = [];
    target.subscribe(() => seen.push(target.getSnapshot().drafts.length));
    const event = { channelId: DM, draftId: 'draft-1', attemptId: 'attempt-1', revision: 1 };
    channel.emit({
      type: 'notification',
      notification: { kind: 'draft', draft: { ...event, botSlug: SLUG, body: 'Hel' } },
    });
    channel.emit({ type: 'notification', notification: { kind: 'draft-settled', event } });
    await until(target, () => seen.length > 0);
    expect(seen).toEqual([0]);
  });

  it('keeps each committed message object while new entries arrive', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 2);
    const target = open(host);
    const before = await until(target, (s) => s.status === 'live' && s.messages.length === 2);
    channel.append({ id: 'bot-3', body: 'more', author: { kind: 'bot', slug: SLUG } });
    const after = await until(target, (s) => s.messages.length === 3);
    expect(after.messages[0]).toBe(before.messages[0]);
    expect(after.messages[1]).toBe(before.messages[1]);
  });

  it('asks for draft appends and applies them on top of the whole body', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 1);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    expect(channel.follows).toEqual([{ channelId: DM, limit: 10, drafts: 'append' }]);
    const draft = { channelId: DM, draftId: 'draft-1', attemptId: 'attempt-1', botSlug: SLUG };
    channel.emit({
      type: 'notification',
      notification: { kind: 'draft', draft: { ...draft, body: 'Hel', revision: 1 } },
    });
    for (const [index, append] of ['lo ', '**there**'].entries())
      channel.emit({
        type: 'notification',
        notification: {
          kind: 'draft-append',
          append: {
            draftId: 'draft-1',
            revision: index + 2,
            base: index + 1,
            offset: index === 0 ? 3 : 6,
            append,
          },
        },
      });
    await until(target, (s) => s.drafts[0]?.body === 'Hello **there**');
    expect(target.getSnapshot().drafts).toEqual([
      { draftId: 'draft-1', botSlug: SLUG, body: 'Hello **there**' },
    ]);
    expect(channel.follows).toHaveLength(1);
  });

  it('follows again for the whole body when an append does not match its copy', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    seed(channel, 1);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    const draft = { channelId: DM, draftId: 'draft-1', attemptId: 'attempt-1', botSlug: SLUG };
    channel.emit({
      type: 'notification',
      notification: { kind: 'draft', draft: { ...draft, body: 'Hel', revision: 1 } },
    });
    await until(target, (s) => s.drafts[0]?.body === 'Hel');
    channel.baselineDrafts = [{ ...draft, body: 'Hello there', revision: 4 }];
    channel.emit({
      type: 'notification',
      notification: {
        kind: 'draft-append',
        append: { draftId: 'draft-1', revision: 4, base: 2, offset: 5, append: ' there' },
      },
    });
    const repaired = await until(target, (s) => s.drafts[0]?.body === 'Hello there');
    expect(repaired.status).toBe('live');
    expect(channel.follows).toHaveLength(2);
    await until(target, () => channel.followerCount === 1);
  });

  it('keeps streaming whole draft bodies from a Host that refuses appends', async () => {
    const host = new FakeHost();
    host.olderHost = true;
    const channel = host.channel(DM);
    seed(channel, 1);
    const target = open(host);
    await until(target, (s) => s.status === 'live');
    expect(channel.follows).toEqual([
      { channelId: DM, limit: 10, drafts: 'append' },
      { channelId: DM, limit: 10 },
    ]);
    channel.emit({
      type: 'notification',
      notification: {
        kind: 'draft',
        draft: {
          channelId: DM,
          draftId: 'draft-1',
          attemptId: 'attempt-1',
          botSlug: SLUG,
          body: 'Hello',
          revision: 1,
        },
      },
    });
    await until(target, (s) => s.drafts[0]?.body === 'Hello');
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
    expect(host.calls.find((call) => call.method.startsWith('channel'))).toMatchObject({
      method: 'channelDm',
      args: { slug: SLUG },
    });
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

it('observes activation only after an accepted foreground send and a new committed Bot entry', async () => {
  const host = new FakeHost();
  const channel = host.channel(DM);
  seed(channel, 2);
  const accepted = vi.fn(() => true);
  const observed = vi.fn();
  const target = open(host, { telemetry: { send: () => ({ accepted, observed }) } });
  target.setForeground?.(true);
  await until(target, (s) => s.status === 'live');
  expect(observed).not.toHaveBeenCalled();
  host.failing.add('channelSend');
  const id = target.send('SENTINEL chat');
  expect(accepted).not.toHaveBeenCalled();
  await until(target, (s) => s.messages.at(-1)?.delivery === 'failed');
  expect(accepted).not.toHaveBeenCalled();
  host.failing.delete('channelSend');
  target.retry(id);
  await until(target, (s) => s.messages.some((m) => m.id === id && m.revision !== undefined));
  expect(accepted).toHaveBeenCalledTimes(1);
  channel.emit({
    type: 'entry',
    entry: { channelId: DM, revision: 2, message: channel.messages[1]! },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(observed).not.toHaveBeenCalled();
  channel.append({ id: 'new-bot', body: 'SENTINEL reply', author: { kind: 'bot', slug: SLUG } });
  await until(target, (s) => s.messages.at(-1)?.id === 'new-bot');
  expect(observed).toHaveBeenCalledTimes(1);
  target.setForeground?.(false);
  channel.append({ id: 'hidden-bot', author: { kind: 'bot', slug: SLUG } });
  await until(target, (s) => s.messages.at(-1)?.id === 'hidden-bot');
  expect(observed).toHaveBeenCalledTimes(1);
});

it('records Host acceptance after leaving the conversation without observing hidden Bot entries', async () => {
  const host = new FakeHost();
  const channel = host.channel(DM);
  seed(channel, 2);
  const accepted = vi.fn(() => true);
  const observed = vi.fn();
  const target = open(host, { telemetry: { send: () => ({ accepted, observed }) } });
  target.setForeground?.(true);
  await until(target, (s) => s.status === 'live');
  const id = target.send('accepted after navigation');
  target.setForeground?.(false);
  await until(target, (s) => s.messages.some((m) => m.id === id && m.revision !== undefined));
  expect(accepted).toHaveBeenCalledTimes(1);
  channel.append({ id: 'hidden-after-acceptance', author: { kind: 'bot', slug: SLUG } });
  await until(target, (s) => s.messages.at(-1)?.id === 'hidden-after-acceptance');
  expect(observed).not.toHaveBeenCalled();
});
