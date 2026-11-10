import { expect, it, vi } from 'vitest';
import { createStore, type ChannelMessage, type ChannelSummary } from '../src/client/store.js';
import { createActions } from '../src/client/actions.js';
import { getGenuiDocumentView } from '../src/client/genui-document-view.js';
import { getGenuiPrivateView } from '../src/client/genui-view.js';
import { initialGenuiView, GenuiError } from '../../core/src/channels/genui.js';
import { initialGenuiDocumentState } from '../../core/src/channels/genui-document.js';
import { syntheticGenuiDocument } from '../../core/test/fixtures/genui-document.js';
import { comparisonReport } from '../../core/test/fixtures/genui-report.js';
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

it.each([
  ['success', 'direct'],
  ['unavailable', 'direct'],
  ['success', 'shared'],
  ['unavailable', 'shared'],
])(
  'wipes retained GenUI drafts before a delayed save %s through the %s purge stream',
  async (outcome, transport) => {
    vi.useFakeTimers();
    const store = createStore();
    store.setMode('bot');
    const actions = createActions(async () => {
      throw new Error('Unexpected Host request');
    }, store);
    vi.spyOn(actions, 'refreshRoster').mockResolvedValue();
    const initial = initialGenuiDocumentState(syntheticGenuiDocument);
    const edited = { version: 1 as const, values: { ...initial.values, filter: 'private draft' } };
    vi.spyOn(actions, 'genuiDocumentView').mockResolvedValue({ version: 0, state: initial });
    vi.spyOn(actions, 'genuiView').mockResolvedValue({ version: 0, state: initialGenuiView() });
    let finishSave: (result: { version: number; state: typeof edited } | Error) => void = () => {
      throw new Error('Save promise was not initialized');
    };
    const deferred = new Promise<{ version: number; state: typeof edited }>((resolve, reject) => {
      finishSave = (result) => (result instanceof Error ? reject(result) : resolve(result));
    });
    vi.spyOn(actions, 'saveGenuiDocumentView').mockReturnValue(deferred);
    const documentView = getGenuiDocumentView(syntheticGenuiDocument, 'one', 'message', actions);
    const otherPlacement = getGenuiDocumentView(
      syntheticGenuiDocument,
      'other',
      'message',
      actions,
    );
    const reportView = getGenuiPrivateView(comparisonReport, 'one', 'message', actions);
    const otherActions = createActions(async () => {
      throw new Error('Unexpected other-owner request');
    }, createStore());
    const otherOwner = getGenuiDocumentView(syntheticGenuiDocument, 'one', 'message', otherActions);
    otherPlacement.edit(edited);
    otherOwner.edit(edited);
    reportView.edit({ ...initialGenuiView(), filter: 'private report draft' });
    reportView.attempts.continue = {
      id: 'human-private',
      payload: 'private submission',
      sent: false,
    };
    const unsubscribe = documentView.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    documentView.edit(edited);
    const saving = documentView.save();
    expect(documentView.getSnapshot().status).toBe('saving');
    unsubscribe();
    const source = new EventTarget();
    const sharedSources: EventTarget[] = [];
    if (transport === 'shared') {
      vi.stubGlobal(
        'EventSource',
        class extends EventTarget {
          close = vi.fn();
          constructor() {
            super();
            sharedSources.push(this);
          }
        },
      );
    }
    const dispose = mountRosterLive(
      store,
      actions,
      transport === 'shared'
        ? undefined
        : () => Object.assign(source, { close: vi.fn() }) as unknown as EventSource,
    );
    try {
      const purgeSource = transport === 'shared' ? sharedSources[0] : source;
      if (!purgeSource) throw new Error('Missing actual purge stream');
      purgeSource.dispatchEvent(event());
      expect(documentView.getSnapshot()).toMatchObject({ available: false, state: initial });
      expect(reportView.getSnapshot()).toMatchObject({
        available: false,
        state: initialGenuiView(),
      });
      expect(reportView.attempts.continue).toBeUndefined();
      expect(otherPlacement.getSnapshot().state).toEqual(edited);
      expect(otherOwner.getSnapshot().state).toEqual(edited);
    } finally {
      finishSave(
        outcome === 'success'
          ? { version: 1, state: edited }
          : new GenuiError('genui-unavailable', 'Unavailable'),
      );
      await saving;
      dispose();
      if (transport === 'shared') vi.unstubAllGlobals();
      vi.useRealTimers();
    }
    expect(documentView.getSnapshot()).toMatchObject({ available: false, state: initial });
    expect(getGenuiDocumentView(syntheticGenuiDocument, 'one', 'message', actions)).not.toBe(
      documentView,
    );
    expect(getGenuiPrivateView(comparisonReport, 'one', 'message', actions)).not.toBe(reportView);
  },
);

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
