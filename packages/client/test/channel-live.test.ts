import { describe, expect, it, vi } from 'vitest';

import type { BridgeActions } from '../src/client/actions.js';
import {
  installChannelFollow,
  prependChannelJournal,
  mountChannelLive,
  type ChannelFollow,
  mountRosterLive,
} from '../src/client/channel-live.js';
import { createStore, type ChannelSummary } from '../src/client/store.js';

const CHANNEL: ChannelSummary = {
  id: 'group-team',
  type: 'group',
  name: 'Team',
  members: [],
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
};

class FakeSource {
  readonly listeners = new Map<string, EventListener>();
  onerror: ((event: Event) => void) | null = null;
  readyState = 1;
  onopen: ((event: Event) => void) | null = null;
  closed = false;
  draftRevision = 0;
  constructor(readonly url: string) {}
  get channelId(): string {
    return new URL(this.url, 'http://localhost').searchParams.get('channelId') ?? '';
  }
  baseline(drafts: unknown[] = []): void {
    this.listeners.get('channel/draft-baseline')?.(
      new MessageEvent('channel/draft-baseline', {
        data: JSON.stringify({ channelId: this.channelId, revision: this.draftRevision, drafts }),
      }),
    );
  }
  emitDraft(id: string, body: string, attemptId = 'attempt'): void {
    this.draftRevision += 1;
    this.listeners.get('channel/draft')?.(
      new MessageEvent('channel/draft', {
        data: JSON.stringify({
          channelId: this.channelId,
          draftId: id,
          attemptId,
          revision: this.draftRevision,
          botSlug: 'ada',
          body,
        }),
      }),
    );
  }
  endDraft(id: string, abandoned = false): void {
    this.draftRevision += 1;
    const name = abandoned ? 'channel/draft-abandoned' : 'channel/draft-settled';
    this.listeners.get(name)?.(
      new MessageEvent(name, {
        data: JSON.stringify({
          channelId: this.channelId,
          draftId: id,
          attemptId: 'attempt',
          revision: this.draftRevision,
          ...(abandoned ? { reason: 'interrupted' } : {}),
        }),
      }),
    );
  }
  addEventListener(name: string, listener: EventListener): void {
    this.listeners.set(name, listener);
  }
  emit(revision: number, id: string, body = id): void {
    this.listeners.get('channel/message')?.(
      new MessageEvent('channel/message', {
        data: JSON.stringify({
          channelId: this.channelId,
          revision,
          message: {
            id,
            at: '2026-09-21T00:00:01.000Z',
            author: { kind: 'bot', slug: 'ada' },
            body,
          },
        }),
      }),
    );
  }
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
}

function setup(refresh = vi.fn(async () => undefined), channel = CHANNEL) {
  const store = createStore();
  const sources: FakeSource[] = [];
  store.setMode('bot');
  store.setRoster([], [channel]);
  store.select({ kind: 'channel', channelId: channel.id });
  store.setConversation({
    status: 'ready',
    channel,
    messages: [],
    revision: 0,
  });
  const actions = { refreshChannelMessages: refresh } as unknown as BridgeActions;
  const dispose = mountChannelLive(store, actions, (url) => {
    const source = new FakeSource(url);
    sources.push(source);
    return source as unknown as EventSource;
  });
  return { store, sources, dispose, refresh };
}
describe('Channel live Client on the journal stream', () => {
  const entry = (revision: number, id: string) => ({
    channelId: CHANNEL.id,
    revision,
    message: {
      id,
      at: '2026-09-21T00:00:01.000Z',
      author: { kind: 'bot' as const, slug: 'ada' },
      body: id,
    },
  });
  it('applies journal changes without opening a source, pages older through it and recovers when closed', async () => {
    let handlers: Parameters<ChannelFollow>[1] | undefined;
    const opened: string[] = [];
    const prepends: number[] = [];
    const stop = vi.fn();
    const uninstall = installChannelFollow((channelId, next) => {
      opened.push(channelId);
      handlers = next;
      return {
        stop,
        prepend: async (before) => {
          prepends.push(before);
          next.change({
            type: 'prepend',
            page: {
              entries: [entry(4, 'four'), entry(5, 'five')],
              olderCursor: 'c4',
              hasOlder: true,
            },
            entries: [entry(4, 'four'), entry(5, 'five')],
          });
        },
      };
    });
    const refresh = vi.fn(async () => undefined);
    const store = createStore();
    store.setMode('bot');
    store.setRoster([], [CHANNEL]);
    store.select({ kind: 'channel', channelId: CHANNEL.id });
    store.setConversation({ status: 'ready', channel: CHANNEL, messages: [], revision: 0 });
    const applied: unknown[] = [];
    const dispose = mountChannelLive(store, {
      refreshChannelMessages: refresh,
      applyChannelTail: (channelId: string, page: { entries: { channelRevision?: number }[] }) => {
        applied.push([channelId, page.entries.map((message) => message.channelRevision)]);
        store.setConversation({
          messages: page.entries as never,
          revision: page.entries.at(-1)?.channelRevision ?? 0,
        });
      },
    } as unknown as BridgeActions);
    try {
      expect(opened).toEqual([CHANNEL.id]);
      const tail = [entry(6, 'six'), entry(7, 'seven')];
      handlers!.change({
        type: 'replace',
        page: { entries: tail, olderCursor: 'c6', hasOlder: true },
        entries: tail,
      });
      expect(applied).toEqual([[CHANNEL.id, [6, 7]]]);
      handlers!.change({
        type: 'notification',
        notification: { kind: 'draft-baseline', channelId: CHANNEL.id, revision: 0, drafts: [] },
      });
      handlers!.change({ type: 'append', entry: entry(8, 'eight') });
      expect(store.getSnapshot().conversation.revision).toBe(8);
      expect(store.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
        'six',
        'seven',
        'eight',
      ]);

      await prependChannelJournal(CHANNEL.id);
      expect(prepends).toEqual([6]);
      expect(store.getSnapshot().conversation.messages.map((item) => item.id)).toEqual([
        'four',
        'five',
        'six',
        'seven',
        'eight',
      ]);
      expect(store.getSnapshot().conversation.timeline).toMatchObject({
        olderCursor: 'c4',
        hasOlder: true,
      });

      handlers!.interrupted(true);
      await vi.waitFor(() => expect(refresh).toHaveBeenCalledWith(CHANNEL.id));
      expect(stop).toHaveBeenCalled();
      await vi.waitFor(() => expect(opened.length).toBeGreaterThan(1));
    } finally {
      dispose();
      uninstall();
    }
    expect(prependChannelJournal(CHANNEL.id)).toBeUndefined();
  });
});

describe('Roster live Client', () => {
  it('refreshes only committed invalidations and recovers after a reconnect', async () => {
    vi.useFakeTimers();
    try {
      const store = createStore();
      store.setMode('bot');
      const signals: AbortSignal[] = [];
      const refreshRoster = vi.fn(
        (signal?: AbortSignal) =>
          new Promise<void>((resolve) => {
            if (signal === undefined) return resolve();
            signals.push(signal);
            signal.addEventListener('abort', () => resolve(), { once: true });
          }),
      );
      const actions = { refreshRoster } as unknown as BridgeActions;
      const sources: FakeSource[] = [];
      const dispose = mountRosterLive(store, actions, (url) => {
        const source = new FakeSource(url);
        sources.push(source);
        return source as unknown as EventSource;
      });
      expect(sources).toHaveLength(1);
      expect(sources[0]?.url).toBe('./api/botharness/stream?scope=roster');
      sources[0]?.listeners.get('roster/changed')?.(new MessageEvent('roster/changed'));
      await vi.advanceTimersByTimeAsync(80);
      expect(refreshRoster).toHaveBeenCalledTimes(1);
      expect(signals[0]?.aborted).toBe(false);
      sources[0]?.onopen?.(new Event('open'));
      await vi.advanceTimersByTimeAsync(80);
      expect(refreshRoster).toHaveBeenCalledTimes(2);
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);
      dispose();
      expect(signals[1]?.aborted).toBe(true);
      expect(sources[0]?.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Roster live Client latest messages', () => {
  it('moves a listed Channel preview forward without a roster refresh', () => {
    const store = createStore();
    store.setMode('bot');
    const other = { ...CHANNEL, id: 'group-other', name: 'Other' };
    store.setRoster([], [CHANNEL, other]);
    const refreshRoster = vi.fn(async () => undefined);
    const sources: FakeSource[] = [];
    const dispose = mountRosterLive(store, { refreshRoster } as unknown as BridgeActions, (url) => {
      const source = new FakeSource(url);
      sources.push(source);
      return source as unknown as EventSource;
    });
    const latest = (channelId: string, id: string, at: string): void =>
      sources[0]?.listeners.get('roster/latest')?.(
        new MessageEvent('roster/latest', {
          data: JSON.stringify({
            channelId,
            message: { id, at, author: { kind: 'human' }, body: id },
          }),
        }),
      );
    const preview = () =>
      store.getSnapshot().channels.find((item) => item.id === CHANNEL.id)?.latestMessage?.id;
    try {
      latest(CHANNEL.id, 'message-278', '2026-10-13T00:00:02.000Z');
      expect(preview()).toBe('message-278');
      expect(store.getSnapshot().channels.find((item) => item.id === CHANNEL.id)?.updatedAt).toBe(
        '2026-10-13T00:00:02.000Z',
      );
      latest(CHANNEL.id, 'older', '2026-10-13T00:00:01.000Z');
      expect(preview()).toBe('message-278');
      latest('unknown', 'stray', '2026-10-13T00:00:03.000Z');
      expect(store.getSnapshot().channels.map((item) => item.id)).not.toContain('unknown');
      expect(
        store.getSnapshot().channels.find((item) => item.id === other.id)?.latestMessage,
      ).toBeUndefined();
      expect(refreshRoster).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });
});

describe('Channel live Client', () => {
  it('advances loaded Human receipts from one bounded read-position event', () => {
    const { store, sources, dispose } = setup();
    store.setConversation({
      messages: [
        {
          id: 'first',
          at: '2026-09-21T00:00:01.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'first',
          channelRevision: 1,
          humanReceipts: [{ humanId: 'local-human', displayName: 'Human', state: 'unread' }],
        },
        {
          id: 'second',
          at: '2026-09-21T00:00:02.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'second',
          channelRevision: 2,
          humanReceipts: [{ humanId: 'local-human', displayName: 'Human', state: 'unread' }],
        },
      ],
      revision: 2,
    });
    sources[0]?.listeners.get('channel/human-read')?.(
      new MessageEvent('channel/human-read', {
        data: JSON.stringify({ channelId: CHANNEL.id, humanId: 'local-human', revision: 1 }),
      }),
    );
    expect(
      store.getSnapshot().conversation.messages.map((item) => item.humanReceipts?.[0]?.state),
    ).toEqual(['read', 'unread']);
    dispose();
  });

  it('replaces one message reactions from a reaction event and drops an empty set', () => {
    const { store, sources, dispose } = setup();
    store.setConversation({
      messages: [
        {
          id: 'first',
          at: '2026-09-21T00:00:01.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'first',
          channelRevision: 1,
        },
      ],
      revision: 1,
    });
    const react = (reactions: unknown, channelId = CHANNEL.id) =>
      sources[0]?.listeners.get('channel/reaction')?.(
        new MessageEvent('channel/reaction', {
          data: JSON.stringify({ channelId, messageId: 'first', reactions }),
        }),
      );
    const reactions = [{ emoji: '👍', actors: [{ kind: 'human', id: 'local-human' }] }];
    react(reactions);
    expect(store.getSnapshot().conversation.messages[0]?.reactions).toEqual(reactions);
    react([{ emoji: '👍', actors: 'everyone' }]);
    react([], 'other-channel');
    expect(store.getSnapshot().conversation.messages[0]?.reactions).toEqual(reactions);
    react([]);
    expect(store.getSnapshot().conversation.messages[0]).not.toHaveProperty('reactions');
    dispose();
  });

  it('appends once, ignores duplicate revisions, and updates the Channel preview', () => {
    const { store, sources, dispose } = setup();
    expect(sources[0]?.url).toContain('channelId=group-team&after=0');
    sources[0]?.emit(1, 'one');
    sources[0]?.emit(1, 'one');
    expect(store.getSnapshot().conversation.messages.map((message) => message.id)).toEqual(['one']);
    expect(store.getSnapshot().conversation.revision).toBe(1);
    expect(store.getSnapshot().channels[0]?.latestMessage?.id).toBe('one');
    dispose();
    expect(sources[0]?.closed).toBe(true);
  });

  it('renders a real PersonaBot DM draft before commit and removes it on the durable reply', () => {
    const dm: ChannelSummary = {
      ...CHANNEL,
      id: 'dm-ada',
      type: 'dm',
      botSlug: 'ada',
      members: ['ada'],
    };
    const { store, sources, dispose } = setup(
      vi.fn(async () => undefined),
      dm,
    );
    sources[0]?.baseline();
    sources[0]?.emitDraft('attempt:call', '你');
    sources[0]?.emitDraft('attempt:call', '你好');
    expect(store.getSnapshot().conversation.drafts).toMatchObject([
      { body: '你好', botSlug: 'ada' },
    ]);
    expect(store.getSnapshot().conversation.revision).toBe(0);
    sources[0]?.emit(1, 'committed', '你好');
    expect(store.getSnapshot().conversation.drafts).toEqual([]);
    expect(store.getSnapshot().conversation.messages.map((item) => item.id)).toEqual(['committed']);
    sources[0]?.endDraft('attempt:call');
    expect(store.getSnapshot().conversation.drafts).toEqual([]);
    dispose();
  });

  it('advances the revision but does not splice live messages into an older window', () => {
    const { store, sources, dispose } = setup();
    store.setConversation({
      messages: [
        {
          id: 'old',
          at: '2026-09-21T00:00:00.000Z',
          author: { kind: 'human' },
          body: 'old',
        },
      ],
      timeline: {
        olderCursor: 'c-old',
        newerCursor: 'c-old',
        hasOlder: false,
        hasNewer: true,
        loadingOlder: false,
        olderError: undefined,
        loadingNewer: false,
        newerError: undefined,
      },
    });
    sources[0]?.emit(1, 'new');
    expect(store.getSnapshot().conversation.messages.map((item) => item.id)).toEqual(['old']);
    expect(store.getSnapshot().conversation.revision).toBe(1);
    expect(store.getSnapshot().channels[0]?.latestMessage?.id).toBe('new');
    dispose();
  });
  it('re-snapshots on a revision gap and reopens from the new cursor', async () => {
    const store = createStore();
    const sources: FakeSource[] = [];
    store.setMode('bot');
    store.setRoster([], [CHANNEL]);
    store.select({ kind: 'channel', channelId: CHANNEL.id });
    store.setConversation({ status: 'ready', channel: CHANNEL, messages: [], revision: 1 });
    const refresh = vi.fn(async () => {
      store.setConversation({ revision: 3, messages: [] });
    });
    const dispose = mountChannelLive(
      store,
      { refreshChannelMessages: refresh } as unknown as BridgeActions,
      (url) => {
        const source = new FakeSource(url);
        sources.push(source);
        return source as unknown as EventSource;
      },
    );
    sources[0]?.emit(3, 'three');
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(refresh).toHaveBeenCalledWith(CHANNEL.id);
    expect(sources[0]?.closed).toBe(true);
    expect(sources[1]?.url).toContain('after=3');
    dispose();
  });

  it('closes the old stream on Channel selection or mode change', () => {
    const { store, sources, dispose } = setup();
    store.select(undefined);
    expect(sources[0]?.closed).toBe(true);
    store.setConversation({ status: 'ready', channel: CHANNEL, revision: 0 });
    expect(sources).toHaveLength(2);
    store.setMode('dsh');
    expect(sources[1]?.closed).toBe(true);
    dispose();
  });

  it('drops speculative drafts and re-snapshots after a draft revision gap', async () => {
    const { store, sources, dispose, refresh } = setup();
    sources[0]?.baseline();
    sources[0]?.emitDraft('attempt:call', '先');
    expect(store.getSnapshot().conversation.drafts).toHaveLength(1);
    if (sources[0] !== undefined) sources[0].draftRevision = 3;
    sources[0]?.emitDraft('attempt:call', '断档');
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(refresh).toHaveBeenCalledWith(CHANNEL.id);
    expect(store.getSnapshot().conversation.drafts).toEqual([]);
    if (sources[1] !== undefined) sources[1].draftRevision = 4;
    sources[1]?.baseline();
    expect(store.getSnapshot().conversation.draftRevision).toBe(4);
    dispose();
  });

  it('shows an interrupted notice without preserving an abandoned draft', () => {
    const { store, sources, dispose } = setup();
    sources[0]?.baseline();
    sources[0]?.emitDraft('attempt:call', '未完成');
    sources[0]?.endDraft('attempt:call', true);
    expect(store.getSnapshot().conversation.drafts).toEqual([]);
    expect(store.getSnapshot().conversation.draftNotice).toBe('interrupted');
    dispose();
  });

  it('replaces a sole draft when the committed Bot text is corrected', () => {
    const { store, sources, dispose } = setup();
    sources[0]?.baseline();
    sources[0]?.emitDraft('attempt:call', 'partial');
    sources[0]?.emit(1, 'reply', 'corrected');
    expect(store.getSnapshot().conversation.drafts).toEqual([]);
    expect(store.getSnapshot().conversation.messages.map((item) => item.body)).toEqual([
      'corrected',
    ]);
    dispose();
  });

  it('re-baselines when the active model attempt changes', async () => {
    const { store, sources, dispose, refresh } = setup();
    sources[0]?.baseline();
    sources[0]?.emitDraft('attempt:call', 'first');
    sources[0]?.endDraft('attempt:call', true);
    sources[0]?.emitDraft('attempt-2:call', 'retry', 'attempt-2');
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(refresh).toHaveBeenCalledWith(CHANNEL.id);
    expect(store.getSnapshot().conversation.drafts).toEqual([]);
    expect(store.getSnapshot().conversation.draftNotice).toBeUndefined();
    dispose();
  });

  it('coalesces multiple draft chunks into one animation-frame render', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const { store, sources, dispose } = setup();
      sources[0]?.baseline();
      sources[0]?.emitDraft('attempt:call', '你');
      sources[0]?.emitDraft('attempt:call', '你好');
      expect(callbacks).toHaveLength(1);
      expect(store.getSnapshot().conversation.drafts).toEqual([]);
      callbacks[0]?.(0);
      expect(store.getSnapshot().conversation.drafts).toMatchObject([{ body: '你好' }]);
      dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
