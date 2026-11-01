import { expect, it, vi } from 'vitest';
import { createStore, type ChannelMessage, type ChannelSummary } from '../src/client/store.js';
import { mountRosterLive } from '../src/client/channel-live.js';
import type { BridgeActions } from '../src/client/actions.js';
import { subscribeMessagingDefaults } from '../src/client/messaging-defaults-live.js';
import {
  createContentRedactions,
  parseContentRedactions,
} from '../src/client/content-redactions.js';

const message: ChannelMessage = {
  id: 'message',
  at: '2026-10-08T00:00:00.000Z',
  author: { kind: 'human' },
  body: 'private source',
  attachments: [{ fileId: 'file', name: 'private.txt', mime: 'text/plain', size: 2 }],
  humanReceipts: [{ humanId: 'local-human', displayName: 'Human', state: 'read' }],
};
const channel = (id: string): ChannelSummary => ({
  id,
  type: 'group',
  name: id,
  members: [],
  createdAt: message.at,
  updatedAt: message.at,
  latestMessage: message,
});
const placements = ['one', 'two'].map((channelId) => ({
  sourceEventId: 'source',
  channelId,
  messageId: 'message',
}));
const event = () => new MessageEvent('content/purged', { data: JSON.stringify({ placements }) });

it('preserves settled message identity across draft-only updates without skipping purges', () => {
  const store = createStore();
  const redactions = createContentRedactions();
  store.setConversation({ status: 'ready', channel: channel('one'), messages: [message] });
  const initial = store.getSnapshot().conversation;
  expect(redactions.conversation(initial)).toBe(initial);
  for (let revision = 1; revision <= 10; revision++) {
    store.setConversation({
      drafts: [
        {
          channelId: 'one',
          draftId: 'draft',
          attemptId: 'attempt',
          revision,
          botSlug: 'ada',
          body: 'x'.repeat(revision),
        },
      ],
      draftRevision: revision,
    });
    expect(store.getSnapshot().conversation.messages).toBe(initial.messages);
    expect(store.getSnapshot().conversation.channel).toBe(initial.channel);
  }
  redactions.accept(placements);
  const purged = redactions.conversation(store.getSnapshot().conversation);
  expect(purged.messages).not.toBe(initial.messages);
  expect(purged.messages[0]?.body).toBe('');
  expect(purged.messages[0]?.attachments).toBeUndefined();
  expect(redactions.conversation({ ...purged, messages: [message] }).messages[0]?.body).toBe('');
});

it('redacts active and cached shared placements, previews, quotes and delayed responses through the live event', () => {
  const store = createStore();
  store.setMode('bot');
  store.setRoster([], [channel('one'), channel('two')]);
  store.select({ kind: 'channel', channelId: 'one' });
  store.setConversation({ status: 'ready', channel: channel('one'), messages: [message] });
  store.select({ kind: 'channel', channelId: 'two' });
  const reply: ChannelMessage = {
    id: 'reply',
    at: message.at,
    author: message.author,
    body: 'retained reply',
    replyTo: message.id,
    replyToPreview: { author: message.author, body: message.body },
  };
  store.setConversation({ status: 'ready', channel: channel('two'), messages: [message, reply] });
  const source = new EventTarget();
  const close = vi.fn();
  const dispose = mountRosterLive(
    store,
    { refreshRoster: vi.fn(async () => {}) } as unknown as BridgeActions,
    () => Object.assign(source, { close }) as unknown as EventSource,
  );
  source.dispatchEvent(event());
  expect(store.getSnapshot().channels.map((item) => item.latestMessage?.body)).toEqual(['', '']);
  expect(store.getSnapshot().conversation.messages[0]).toEqual({
    ...message,
    body: '',
    contentPurged: true,
    attachments: undefined,
  });
  expect(store.getSnapshot().conversation.messages[1]).toMatchObject({
    body: 'retained reply',
    replyToPreview: null,
  });
  store.setConversation({ messages: [message, reply] });
  store.setRoster([], [channel('one'), channel('two')]);
  store.updateCachedConversation('one', (cached) => ({ ...cached, messages: [message] }));
  expect(store.getSnapshot().conversation.messages[0]?.body).toBe('');
  expect(store.getSnapshot().channels[0]?.latestMessage?.attachments).toBeUndefined();
  store.select({ kind: 'channel', channelId: 'one' });
  expect(store.getSnapshot().conversation.messages[0]?.body).toBe('');
  expect(store.getSnapshot().conversation.messages[0]?.attachments).toBeUndefined();
  expect(store.getSnapshot().conversation.messages[0]?.humanReceipts).toEqual(
    message.humanReceipts,
  );
  dispose();
  expect(close).toHaveBeenCalledOnce();
});

it('replays purge baselines to a late subscriber on the existing shared roster connection', async () => {
  const sources: EventTarget[] = [];
  class Source extends EventTarget {
    close = vi.fn();
    constructor() {
      super();
      sources.push(this);
    }
  }
  vi.stubGlobal('EventSource', Source);
  const stopSettings = subscribeMessagingDefaults(() => {});
  sources[0]!.dispatchEvent(event());
  const onPurge = vi.fn();
  const stopRoster = subscribeMessagingDefaults(() => {}, onPurge);
  try {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(sources).toHaveLength(1);
    expect(onPurge).toHaveBeenCalledWith(placements);
    expect(
      parseContentRedactions(new MessageEvent('content/purged', { data: '{invalid' })),
    ).toEqual([]);
    expect(
      parseContentRedactions(
        new MessageEvent('content/purged', {
          data: JSON.stringify({ placements: [{ channelId: 3 }] }),
        }),
      ),
    ).toEqual([]);
  } finally {
    stopRoster();
    stopSettings();
    vi.unstubAllGlobals();
  }
});
