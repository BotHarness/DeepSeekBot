import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  reactable,
  shownInChat,
  type CachedConversation,
} from '@botharness/host-client/conversation';
import { createConversationPlayback } from '../src/host/conversation-playback';
import { messageForDisplay } from '../src/host/message-display';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';
import wire from '../../../packages/host-client/test/fixtures/host-wire.json';
import type { ChannelMessage } from '../../../packages/core/src/channels/channel';

import {
  DM,
  ROUTE,
  SLUG,
  client,
  contiguous,
  ids,
  open,
  revisions,
  seed,
  stopConversation,
  until,
} from './conversation-fixtures';

afterEach(stopConversation);

describe('DM conversation', () => {
  it('retains the source Channel and rich payload through the shared display projection', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append(
      {
        id: 'rich-message',
        author: { kind: 'bot', slug: SLUG },
        body: 'Image and approval',
        format: 'text',
        attachments: [
          {
            fileId: 'file:11111111-1111-4111-8111-111111111111',
            name: 'photo.png',
            mime: 'image/png',
            size: 12,
          },
        ],
        toolApprovalRequest: {
          sessionId: 'session',
          callId: 'call',
          toolName: 'bash',
          role: 'orchestrator',
          cwd: '/source',
          input: '{"command":"pwd"}',
        },
      },
      false,
    );
    const live = await until(open(host), (snapshot) => snapshot.status === 'live');
    const message = live.messages.find((entry) => entry.id === 'rich-message')!;
    expect(message.source?.channelId).toBe(DM);
    expect(messageForDisplay(message)).toMatchObject({
      format: 'text',
      toolApprovalRequest: { callId: 'call' },
      attachments: [{ fileId: 'file:11111111-1111-4111-8111-111111111111' }],
    });
    expect(message.attachments[0]?.source?.uri).toContain(
      `${ROUTE}/botharness-device/api/botharness/attachment?`,
    );
  });

  it('shows paged committed history immediately while playback is held away from latest', async () => {
    const host = new FakeHost();
    seed(host.channel(DM), 25);
    const target = open(host);
    await until(target, (snapshot) => snapshot.status === 'live');
    const playback = createConversationPlayback(target);
    const stop = playback.subscribe(() => {});
    playback.setFollowing(false);
    try {
      await target.loadOlder();
      const messages = target.getSnapshot().messages;
      expect(messages[0]).toMatchObject({ revision: 8, body: 'answer 8' });
      const presented = messages.map(
        (message) => (playback.getBubble(playback.rowKey(message.id))?.message ?? message).body,
      );
      expect(presented).toEqual(messages.map((message) => message.body));
      expect(playback.diagnostics()).toEqual([]);
      playback.setFollowing(true);
      expect(playback.diagnostics()).toEqual([]);
    } finally {
      stop();
    }
  });

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

  it.each(['success', 'failure'])(
    'can page after reopening while an old request ends with %s',
    async (outcome) => {
      const host = new FakeHost();
      const channel = host.channel(DM);
      seed(channel, 25);
      const target = open(host);
      await until(target, (snapshot) => snapshot.status === 'live');
      const gate = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((done) => {
          resolve = done;
        });
        return { promise, resolve };
      };
      const oldGate = gate();
      const newGate = gate();
      let requests = 0;
      host.methods.set('channelJournalPage', async () => {
        const old = ++requests === 1;
        const gate = old ? oldGate : newGate;
        await gate.promise;
        if (old && outcome === 'failure') throw new Error('Old connection lost');
        return channel.page(25, 16, 8);
      });
      try {
        const oldRequest = target.loadOlder();
        await vi.waitFor(() => expect(requests).toBe(1));
        target.stop();
        target.start();
        await until(target, (snapshot) => snapshot.status === 'live');
        expect(target.getSnapshot().loadingOlder).toBe(false);
        const newRequest = target.loadOlder();
        await vi.waitFor(() => expect(requests).toBe(2));
        oldGate.resolve();
        await oldRequest;
        expect(target.getSnapshot().loadingOlder).toBe(true);
        await target.loadOlder();
        expect(requests).toBe(2);
        newGate.resolve();
        await newRequest;
        expect(target.getSnapshot().loadingOlder).toBe(false);
        expect(revisions(target.getSnapshot())).toEqual(
          Array.from({ length: 18 }, (_, index) => index + 8),
        );
        expect(new Set(ids(target.getSnapshot())).size).toBe(18);
      } finally {
        oldGate.resolve();
        newGate.resolve();
      }
    },
  );
  it('keeps loaded history after a failed earlier page and clears the error on explicit retry', async () => {
    const host = new FakeHost();
    seed(host.channel(DM), 25);
    const target = open(host);
    const live = await until(target, (snapshot) => snapshot.status === 'live');
    host.failing.add('channelJournalPage');
    await target.loadOlder();
    expect(target.getSnapshot()).toMatchObject({
      status: 'live',
      loadingOlder: false,
      hasOlder: true,
      olderError: true,
    });
    expect(ids(target.getSnapshot())).toEqual(ids(live));
    expect(target.getTimelineSnapshot().olderError).toBe(true);
    host.failing.delete('channelJournalPage');
    await target.loadOlder();
    expect(target.getSnapshot().olderError).toBeUndefined();
    expect(target.getTimelineSnapshot().olderError).toBeUndefined();
    expect(revisions(target.getSnapshot())).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 8),
    );
    expect(new Set(ids(target.getSnapshot())).size).toBe(18);
  });

  it.each(['allowed-once', 'allowed-always-tool', 'rejected'] as const)(
    'marks request cards and %s history',
    async (outcome) => {
      const host = new FakeHost();
      const channel = host.channel(DM);
      const bot = { kind: 'bot' as const, slug: SLUG };
      channel.append({
        id: 'ask-tool',
        author: bot,
        body: '请求批准执行 bash',
        toolApprovalRequest: {
          toolName: 'bash',
          role: 'orchestrator',
          cwd: '/w',
          input: '{"command":"ls /w"}',
        },
      } as never);
      channel.append({
        id: 'tool-decided',
        body: '已批准这一次工具调用',
        toolApprovalDecision: { requestMessageId: 'ask-tool', outcome },
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
      expect(tool?.card).toEqual({
        kind: 'tool-approval',
        channelId: DM,
        subject: 'bash',
        command: 'ls /w',
        approvalContent: {
          toolName: 'bash',
          role: 'orchestrator',
          cwd: '/w',
          input: '{"command":"ls /w"}',
          allowAlways: false,
        },
      });
      expect(decided?.resolves).toEqual({
        requestId: 'ask-tool',
        resolution: { kind: 'tool-approval', outcome },
      });
      expect(ask?.card).toEqual({ kind: 'user-question', channelId: DM, subject: 'Which colour?' });
      expect(cancelled?.resolves).toEqual({
        requestId: 'ask-question',
        resolution: { kind: 'user-question', state: 'cancelled' },
      });
    },
  );

  it('marks folder requests as cards and hides the read/write answer behind them', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    const bot = { kind: 'bot' as const, slug: SLUG };
    channel.append({
      id: 'ask-folder',
      author: bot,
      body: 'I need your project folder.',
      grantRequest: true,
    } as never);
    channel.append({
      id: 'grant-resolution-ask-folder',
      body: 'I authorized workspace “Project” for read/write. Continue the original task.',
      replyTo: 'ask-folder',
      grantRequestResolution: { requestMessageId: 'ask-folder', grantId: 'g1' },
    } as never);
    channel.append({
      id: 'ask-old-folder',
      author: bot,
      body: 'Another folder.',
      grantRequest: true,
      grantRequestResolved: true,
    } as never);
    const live = await until(open(host), (snapshot) => snapshot.status === 'live');
    const [ask, answered, old] = live.messages;
    expect(ask?.card).toEqual({ kind: 'grant', channelId: DM });
    expect(answered?.resolves).toEqual({ requestId: 'ask-folder', resolution: { kind: 'grant' } });
    expect(old?.card).toEqual({ kind: 'grant', channelId: DM, resolved: true });
    expect(live.messages.filter(shownInChat).map((message) => message.id)).toEqual([
      'ask-folder',
      'ask-old-folder',
    ]);
  });

  it('keeps the Host wire message for clients that render full cards', async () => {
    const host = new FakeHost();
    const request = {
      sessionId: 'session-1',
      callId: 'call-1',
      toolName: 'bash',
      role: 'orchestrator',
      cwd: '/work',
      input: '{"command":"pwd"}',
    };
    host.channel(DM).append({
      id: 'approve-pwd',
      author: { kind: 'bot' as const, slug: SLUG },
      body: 'Approve bash',
      toolApprovalRequest: request,
    } as never);
    const target = open(host);
    await until(target, (snapshot) => snapshot.status === 'live');
    expect(target.wireMessage?.('approve-pwd')).toMatchObject({
      id: 'approve-pwd',
      toolApprovalRequest: request,
    });
    expect(target.wireMessage?.('missing')).toBeUndefined();
  });

  it('marks private input requests as cards and hides their resolution', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append({
      id: 'ask-key',
      author: { kind: 'bot' as const, slug: SLUG },
      body: 'I need the GitHub token.',
      privateInputRequest: {
        account: 'github',
        purpose: 'Read the private repository',
        fields: [{ id: 'token', label: 'Token', required: true }],
      },
    } as never);
    channel.append({
      id: 'private-resolution-ask-key',
      body: 'Private input configured.',
      privateInputResolution: { requestMessageId: 'ask-key', state: 'configured', references: {} },
    } as never);
    const live = await until(open(host), (snapshot) => snapshot.status === 'live');
    const [ask, resolution] = live.messages;
    expect(ask?.card).toEqual({
      kind: 'private-input',
      channelId: DM,
      subject: 'Read the private repository',
    });
    expect(resolution?.resolves).toEqual({
      requestId: 'ask-key',
      resolution: { kind: 'private-input' },
    });
    expect(live.messages.filter(shownInChat).map((message) => message.id)).toEqual(['ask-key']);
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

  it('opens live history while a cache read never completes', async () => {
    const host = new FakeHost();
    seed(host.channel(DM), 2);
    const target = open(host, {
      cache: {
        read: () => new Promise(() => {}),
        write: () => {},
      },
    });
    const live = await until(target, (s) => s.status === 'live');
    expect(ids(live)).toEqual(['human-1', 'bot-2']);
    expect(live.fromCache).toBe(false);
  });

  it.each([false, true])(
    'does not resurrect stale cached messages after an empty live page (interrupted: %s)',
    async (interrupted) => {
      const staleHost = new FakeHost();
      seed(staleHost.channel(DM), 2);
      const stale = staleHost.channel(DM).page(2, undefined, 2)!;
      let release: (value: CachedConversation) => void = () => {};
      const pending = new Promise<CachedConversation>((resolve) => {
        release = resolve;
      });
      const host = new FakeHost();
      host.channel(DM);
      const target = open(host, {
        cache: { read: () => pending, write: () => {} },
      });
      await until(target, (s) => s.status === 'live');
      if (interrupted) {
        host.kill();
        await until(target, (s) => s.status === 'interrupted');
      }
      release({ entries: stale.entries, hasOlder: false });
      await pending;
      await Promise.resolve();
      expect(target.getSnapshot().messages).toEqual([]);
      expect(target.getSnapshot().fromCache).toBe(false);
    },
  );
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

  it('shows another person on their own side under their name, and the signed-in person as self', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append(
      {
        id: 'bob-1',
        body: 'hi alice',
        author: { kind: 'human', humanId: 'human-bob', displayName: 'Bob' },
      },
      false,
    );
    channel.append(
      {
        id: 'alice-1',
        body: 'hi bob',
        author: { kind: 'human', humanId: 'human-alice', displayName: 'Alice' },
        replyTo: 'bob-1',
        replyToPreview: {
          author: { kind: 'human', humanId: 'human-bob', displayName: 'Bob' },
          body: 'hi alice',
        },
      },
      false,
    );
    channel.append(
      {
        id: 'bob-2',
        body: 'quoting you',
        author: { kind: 'human', humanId: 'human-bob', displayName: 'Bob' },
        replyTo: 'alice-1',
        replyToPreview: {
          author: { kind: 'human', humanId: 'human-alice', displayName: 'Alice' },
          body: 'hi bob',
        },
      },
      false,
    );
    const target = open(host, { selfHumanId: 'human-alice' });
    const live = await until(target, (s) => s.status === 'live' && s.messages.length === 3);
    expect(live.messages[0]).toMatchObject({
      author: 'person',
      person: { humanId: 'human-bob', name: 'Bob' },
    });
    expect(live.messages[1]).toMatchObject({
      author: 'human',
      replyPreview: { author: { kind: 'human', humanId: 'human-bob', displayName: 'Bob' } },
    });
    expect(live.messages[1]).not.toHaveProperty('person');
    expect(live.messages[2]).toMatchObject({
      author: 'person',
      replyPreview: { author: { kind: 'human' } },
    });
    expect(live.messages[2]?.replyPreview?.author).toEqual({ kind: 'human' });
    expect(messageForDisplay(live.messages[0]!).author).toEqual({
      kind: 'human',
      humanId: 'human-bob',
      displayName: 'Bob',
    });
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
});
