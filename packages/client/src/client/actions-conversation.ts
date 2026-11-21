import { unreadAfterAnchor } from './timeline-position.js';
import {
  reactToChannelMessage,
  searchAllMessages,
  searchChannelMessages,
  type MessageSearchPage,
  BridgeCallError,
  errorMessage,
  loadTimelinePage,
  loadReadPosition,
  loadChannels,
  openDmChannel,
  type BridgeCall,
} from './bridge.js';
import { toggledReactions } from './message-reactions-model.js';
import { prependChannelJournal } from './channel-live.js';
import {
  initialTimeline,
  type ChannelMessage,
  type ClientStore,
  type ConversationSelection,
} from './store.js';
import type { BridgeActions } from './actions.js';
import type { createSessionActions } from './actions-sessions.js';
import type { createActivityActions, ActivityActions } from './actions-activity.js';
import type { createComposerActions } from './actions-composer.js';

export interface ConversationActions {
  openBot(slug: string, view?: 'profile' | 'inbox'): Promise<void>;
  openChannel(channelId: string, options?: { scopedCall?: BridgeCall | undefined }): Promise<void>;
  openChannelAtMessage(channelId: string, messageId: string): Promise<void>;
  loadOlder(channelId: string): Promise<void>;
  loadNewer(channelId: string): Promise<void>;
  openLatest(channelId: string): Promise<void>;
  openAround(channelId: string, messageId: string): Promise<void>;
  reactToMessage?(
    channelId: string,
    messageId: string,
    emoji: string,
    active: boolean,
  ): Promise<void>;
  searchChannel?(
    channelId: string,
    text: string,
    cursor?: string,
  ): Promise<{ messages: ChannelMessage[]; nextCursor?: string }>;
  searchMessages?(text: string, cursor?: string): Promise<MessageSearchPage>;
  markChannelRead(channelId: string): Promise<void>;
  refreshChannelMessages(channelId: string, scopedCall?: BridgeCall): Promise<void>;
  applyChannelTail(
    channelId: string,
    page: {
      entries: ChannelMessage[];
      olderCursor: string | null;
      hasOlder: boolean;
    },
  ): void;
}

function mergeLatestWindow(
  previous: readonly ChannelMessage[],
  incoming: readonly ChannelMessage[],
): { messages: ChannelMessage[]; keptPrefix: boolean } {
  const first = incoming[0];
  const overlap = first === undefined ? -1 : previous.findIndex((item) => item.id === first.id);
  const committed = previous.filter((item) => item.channelRevision !== undefined);
  const continues =
    overlap < 0 &&
    first?.channelRevision !== undefined &&
    committed.at(-1)?.channelRevision === first.channelRevision - 1;
  const prefix = continues ? committed : overlap < 0 ? [] : previous.slice(0, overlap);
  const seen = new Set<string>();
  const messages = [
    ...prefix,
    ...incoming,
    ...previous.filter((item) => item.pending === true || item.failed !== undefined),
  ].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return { messages, keptPrefix: overlap >= 0 || continues };
}

export function createConversationActions(
  call: BridgeCall,
  clientStore: ClientStore,
  getActions: () => Pick<BridgeActions, 'refreshChannelMessages' | 'markRead'>,
  currentSelection: ReturnType<typeof createSessionActions>['currentSelection'],
  loadSessionsFor: ReturnType<typeof createSessionActions>['loadSessionsFor'],
  loadBotInboxFor: ReturnType<typeof createActivityActions>['loadBotInboxFor'],
  refreshActivityListStatus: ActivityActions['refreshActivityListStatus'],
  remainingFailures: ReturnType<typeof createComposerActions>['remainingFailures'],
) {
  const loadOpeningTimeline = async (
    channelId: string,
    active: ConversationSelection,
    scopedCall = call,
  ) => {
    const controller = new AbortController();
    const unsubscribe = clientStore.subscribe(() => {
      if (currentSelection() !== active) controller.abort();
    });
    try {
      if (currentSelection() !== active) return;
      const anchor = await loadReadPosition(scopedCall, channelId, controller.signal);
      if (currentSelection() !== active) return;
      if (anchor !== undefined) {
        try {
          const opened = await loadTimelinePage(
            scopedCall,
            channelId,
            { direction: 'around', around: anchor },
            controller.signal,
          );
          return {
            ...opened,
            focusMessageId: undefined,
            unreadAfterMessageId: unreadAfterAnchor(
              opened.page.entries,
              anchor,
              opened.page.hasNewer,
            ),
          };
        } catch (error) {
          if (!(error instanceof BridgeCallError) || error.code !== 'invalid-input') throw error;
        }
      }
      if (currentSelection() !== active) return;
      return {
        ...(await loadTimelinePage(scopedCall, channelId, {}, controller.signal)),
        focusMessageId: undefined,
        unreadAfterMessageId: undefined,
      };
    } finally {
      unsubscribe();
    }
  };
  const refreshUnreadDivider = async (
    channelId: string,
    active: ConversationSelection,
    scopedCall = call,
  ): Promise<void> => {
    const anchor = await loadReadPosition(scopedCall, channelId).catch(() => undefined);
    const conversation = clientStore.getSnapshot().conversation;
    if (currentSelection() !== active || conversation.channel?.id !== channelId) return;
    const unreadAfterMessageId = unreadAfterAnchor(
      conversation.messages,
      anchor,
      conversation.timeline.hasNewer,
    );
    if (unreadAfterMessageId !== undefined) clientStore.setConversation({ unreadAfterMessageId });
  };
  const openChannelById = async (
    channelId: string,
    {
      messageId,
      scopedCall = call,
    }: { messageId?: string; scopedCall?: BridgeCall | undefined } = {},
  ): Promise<void> => {
    scopedCall.assertCurrent?.();
    const snapshot = clientStore.getSnapshot();
    const requestedFrom = currentSelection();
    let channel = snapshot.channels.find((candidate) => candidate.id === channelId);
    if (channel === undefined && messageId !== undefined) {
      const channels = await loadChannels(scopedCall);
      if (currentSelection() !== requestedFrom) return;
      clientStore.setRoster(clientStore.getSnapshot().bots, channels);
      channel = channels.find((candidate) => candidate.id === channelId);
    }
    if (channel === undefined) {
      if (messageId !== undefined) throw new Error('Source Channel is no longer available');
      return;
    }
    const sourcePage =
      messageId === undefined
        ? undefined
        : await loadTimelinePage(scopedCall, channelId, {
            direction: 'around',
            around: messageId,
          });
    if (sourcePage !== undefined && currentSelection() !== requestedFrom) return;
    const selection: ConversationSelection = { kind: 'channel', channelId };
    clientStore.select(selection, {
      deferConversation: messageId !== undefined,
    });
    const active = currentSelection();
    if (active === undefined) return;
    if (messageId === undefined && clientStore.getSnapshot().conversation.status === 'ready') {
      clientStore.setConversation({ channel, error: undefined });
      try {
        await getActions().refreshChannelMessages(channelId, scopedCall);
        await refreshUnreadDivider(channelId, active, scopedCall);
      } catch (error) {
        if (currentSelection() === active)
          clientStore.setConversation({ error: errorMessage(error) });
      }
      if (channel.type === 'dm' && channel.botSlug !== undefined)
        await loadSessionsFor(channel.botSlug, active);
      return;
    }
    clientStore.setConversation({
      status: 'loading',
      channel,
      messages: [],
      revision: 0,
      timeline: initialTimeline(),
      focusMessageId: undefined,
      error: undefined,
      sending: false,
    });
    try {
      const opened =
        sourcePage === undefined
          ? await loadOpeningTimeline(channelId, active, scopedCall)
          : {
              ...sourcePage,
              focusMessageId: messageId,
              unreadAfterMessageId: undefined,
            };
      if (opened === undefined) return;
      const { page, revision, focusMessageId, unreadAfterMessageId } = opened;
      const failures = remainingFailures(channelId, page.entries);
      const messages = page.hasNewer ? page.entries : [...page.entries, ...failures];
      if (currentSelection() !== active) return;
      clientStore.setConversation({
        status: 'ready',
        channel,
        messages,
        revision,
        timeline: { ...initialTimeline(), ...page },
        focusMessageId,
        unreadAfterMessageId,
        error: undefined,
        sending: false,
      });
    } catch (error) {
      if (currentSelection() !== active) return;
      clientStore.setConversation({
        status: 'error',
        error: errorMessage(error),
        sending: false,
      });
    }
    if (channel.type === 'dm' && channel.botSlug !== undefined) {
      await loadSessionsFor(channel.botSlug, active);
    }
  };

  const actions = {
    async openBot(slug, view) {
      const snapshot = clientStore.getSnapshot();
      const bot = snapshot.bots.find((candidate) => candidate.slug === slug);
      if (bot === undefined) return;
      const selection: ConversationSelection = {
        kind: 'bot',
        slug,
        ...(view === 'profile' ? { profile: true } : {}),
        ...(view === 'inbox'
          ? {
              inboxRequest:
                (snapshot.selection?.kind === 'bot' ? (snapshot.selection.inboxRequest ?? 0) : 0) +
                1,
            }
          : {}),
      };
      clientStore.select(selection);
      const active = currentSelection();
      if (active === undefined) return;
      let cached = clientStore.getSnapshot().conversation.status === 'ready';
      if (!cached)
        clientStore.setConversation({
          status: 'loading',
          channel: undefined,
          messages: [],
          revision: 0,
          timeline: initialTimeline(),
          focusMessageId: undefined,
          error: undefined,
          sending: false,
        });
      try {
        const channel = await openDmChannel(call, slug, bot.displayName);
        if (currentSelection() !== active) return;
        if (cached && clientStore.getSnapshot().conversation.channel?.id === channel.id) {
          clientStore.upsertChannel(channel);
          clientStore.setConversation({ channel, error: undefined });
          await getActions().refreshChannelMessages(channel.id);
          await refreshUnreadDivider(channel.id, active);
          if (bot.sharedBy === undefined)
            await Promise.all([loadSessionsFor(slug, active), loadBotInboxFor(slug, active)]);
          return;
        }
        if (cached) {
          cached = false;
          clientStore.setConversation({
            status: 'loading',
            channel,
            messages: [],
            drafts: [],
            revision: 0,
            timeline: initialTimeline(),
            focusMessageId: undefined,
            error: undefined,
          });
        }
        const opened = await loadOpeningTimeline(channel.id, active);
        if (opened === undefined) return;
        const { page, revision, focusMessageId, unreadAfterMessageId } = opened;
        const messages = page.entries;
        if (currentSelection() !== active) return;
        const listedChannel = clientStore
          .getSnapshot()
          .channels.find((candidate) => candidate.id === channel.id);
        const latestMessage = page.hasNewer ? undefined : messages.at(-1);
        const projectedChannel =
          listedChannel?.latestMessage !== undefined
            ? listedChannel
            : latestMessage === undefined
              ? (listedChannel ?? channel)
              : {
                  ...(listedChannel ?? channel),
                  updatedAt: latestMessage.at,
                  latestMessage,
                };
        clientStore.upsertChannel(projectedChannel);
        clientStore.setConversation({
          status: 'ready',
          channel: projectedChannel,
          messages: page.hasNewer
            ? messages
            : [...messages, ...remainingFailures(channel.id, page.entries)],
          revision,
          timeline: { ...initialTimeline(), ...page },
          focusMessageId,
          unreadAfterMessageId,
          error: undefined,
          sending: false,
        });
      } catch (error) {
        if (currentSelection() !== active) return;
        clientStore.setConversation({
          status: cached ? 'ready' : 'error',
          error: errorMessage(error),
          sending: false,
        });
      }
      if (bot.sharedBy === undefined)
        await Promise.all([loadSessionsFor(slug, active), loadBotInboxFor(slug, active)]);
    },
    openChannel(channelId, options) {
      return openChannelById(channelId, options);
    },
    openChannelAtMessage(channelId, messageId) {
      return openChannelById(channelId, { messageId });
    },
    async reactToMessage(channelId, messageId, emoji, active) {
      const apply = (reactions: (current: ChannelMessage) => ChannelMessage['reactions']) => {
        const snapshot = clientStore.getSnapshot();
        if (snapshot.conversation.channel?.id !== channelId) return;
        clientStore.setConversation({
          messages: snapshot.conversation.messages.map((message) => {
            if (message.id !== messageId) return message;
            const next = reactions(message);
            const { reactions: _previous, ...rest } = message;
            return next === undefined || next.length === 0 ? rest : { ...rest, reactions: next };
          }),
        });
      };
      const before = clientStore
        .getSnapshot()
        .conversation.messages.find((message) => message.id === messageId)?.reactions;
      apply((message) => toggledReactions(message.reactions, emoji, active));
      try {
        const reactions = await reactToChannelMessage(call, channelId, messageId, emoji, active);
        apply(() => reactions);
      } catch (error) {
        apply(() => before);
        throw error;
      }
    },
    searchChannel(channelId, text, cursor) {
      return searchChannelMessages(call, channelId, text, cursor);
    },
    searchMessages(text, cursor) {
      return searchAllMessages(call, text, cursor);
    },
    async markChannelRead(channelId) {
      const messageId = clientStore
        .getSnapshot()
        .channels.find((channel) => channel.id === channelId)?.latestMessage?.id;
      if (messageId === undefined) return;
      clientStore.setActivityList({
        channelUnread: Object.fromEntries(
          Object.entries(clientStore.getSnapshot().activityList.channelUnread).filter(
            ([id]) => id !== channelId,
          ),
        ),
      });
      try {
        await getActions().markRead(channelId, messageId);
      } catch (error) {
        await refreshActivityListStatus();
        throw error;
      }
    },
    async loadOlder(channelId) {
      const snapshot = clientStore.getSnapshot();
      const timeline = snapshot.conversation.timeline;
      if (
        snapshot.conversation.channel?.id !== channelId ||
        !timeline.hasOlder ||
        timeline.olderCursor === null ||
        timeline.loadingOlder
      )
        return;
      clientStore.setConversation({
        timeline: { ...timeline, loadingOlder: true, olderError: undefined },
      });
      const viaJournal = prependChannelJournal(channelId, clientStore);
      if (viaJournal !== undefined) {
        let olderError: string | undefined;
        try {
          await viaJournal;
        } catch (error) {
          olderError = errorMessage(error);
        }
        const latest = clientStore.getSnapshot();
        if (latest.conversation.channel?.id !== channelId) return;
        clientStore.setConversation({
          timeline: {
            ...latest.conversation.timeline,
            loadingOlder: false,
            olderError,
          },
        });
        return;
      }
      try {
        const { page } = await loadTimelinePage(call, channelId, {
          direction: 'older',
          cursor: timeline.olderCursor,
        });
        const latest = clientStore.getSnapshot();
        if (
          latest.conversation.channel?.id !== channelId ||
          !latest.conversation.timeline.loadingOlder ||
          latest.conversation.timeline.olderCursor !== timeline.olderCursor
        )
          return;
        const pageIds = new Set(page.entries.map((entry) => entry.id));
        clientStore.setConversation({
          messages: [
            ...page.entries,
            ...latest.conversation.messages.filter((entry) => !pageIds.has(entry.id)),
          ],
          timeline: {
            ...latest.conversation.timeline,
            olderCursor: page.olderCursor,
            hasOlder: page.hasOlder,
            loadingOlder: false,
            olderError: undefined,
          },
        });
      } catch (error) {
        const latest = clientStore.getSnapshot();
        if (
          latest.conversation.channel?.id !== channelId ||
          !latest.conversation.timeline.loadingOlder ||
          latest.conversation.timeline.olderCursor !== timeline.olderCursor
        )
          return;
        clientStore.setConversation({
          timeline: {
            ...latest.conversation.timeline,
            loadingOlder: false,
            olderError: errorMessage(error),
          },
        });
      }
    },
    async loadNewer(channelId) {
      const snapshot = clientStore.getSnapshot();
      const timeline = snapshot.conversation.timeline;
      if (
        snapshot.conversation.channel?.id !== channelId ||
        !timeline.hasNewer ||
        timeline.newerCursor === null ||
        timeline.loadingNewer
      )
        return;
      clientStore.setConversation({
        timeline: { ...timeline, loadingNewer: true, newerError: undefined },
      });
      try {
        const { page, revision } = await loadTimelinePage(call, channelId, {
          direction: 'newer',
          cursor: timeline.newerCursor,
        });
        const latest = clientStore.getSnapshot();
        if (
          latest.conversation.channel?.id !== channelId ||
          !latest.conversation.timeline.loadingNewer ||
          latest.conversation.timeline.newerCursor !== timeline.newerCursor
        )
          return;
        const cursorDidNotAdvance =
          page.hasNewer && (page.newerCursor === null || page.newerCursor === timeline.newerCursor);
        const pageIds = new Set(page.entries.map((entry) => entry.id));
        const existing = latest.conversation.messages.filter((entry) => !pageIds.has(entry.id));
        const seen = new Set(existing.map((entry) => entry.id));
        const incoming = page.entries.filter((entry) => !seen.has(entry.id));
        const failures = remainingFailures(channelId, page.entries);
        clientStore.setConversation({
          messages: [...existing, ...incoming, ...(page.hasNewer ? [] : failures)].filter(
            (entry, index, entries) =>
              entries.findIndex((candidate) => candidate.id === entry.id) === index,
          ),
          revision: Math.max(revision, latest.conversation.revision),
          timeline: {
            ...latest.conversation.timeline,
            newerCursor: cursorDidNotAdvance
              ? latest.conversation.timeline.newerCursor
              : (page.newerCursor ?? latest.conversation.timeline.newerCursor),
            hasNewer: cursorDidNotAdvance ? false : page.hasNewer,
            loadingNewer: false,
            newerError: cursorDidNotAdvance ? 'Timeline newer cursor did not advance' : undefined,
          },
        });
      } catch (error) {
        const latest = clientStore.getSnapshot();
        if (
          latest.conversation.channel?.id !== channelId ||
          !latest.conversation.timeline.loadingNewer ||
          latest.conversation.timeline.newerCursor !== timeline.newerCursor
        )
          return;
        clientStore.setConversation({
          timeline: {
            ...latest.conversation.timeline,
            loadingNewer: false,
            newerError: errorMessage(error),
          },
        });
      }
    },
    async openLatest(channelId) {
      const { page, revision } = await loadTimelinePage(call, channelId);
      if (clientStore.getSnapshot().conversation.channel?.id !== channelId) return;
      clientStore.setConversation({
        messages: [...page.entries, ...remainingFailures(channelId, page.entries)],
        revision,
        timeline: { ...initialTimeline(), ...page },
        focusMessageId: undefined,
        error: undefined,
      });
    },
    async openAround(channelId, messageId) {
      try {
        const { page, revision } = await loadTimelinePage(call, channelId, {
          direction: 'around',
          around: messageId,
        });
        if (clientStore.getSnapshot().conversation.channel?.id !== channelId) return;
        clientStore.setConversation({
          messages: page.entries,
          revision,
          timeline: { ...initialTimeline(), ...page },
          focusMessageId: messageId,
          error: undefined,
        });
      } catch (error) {
        if (clientStore.getSnapshot().conversation.channel?.id !== channelId) return;
        clientStore.setConversation({ error: errorMessage(error) });
      }
    },
    applyChannelTail(channelId, page) {
      const snapshot = clientStore.getSnapshot();
      if (snapshot.conversation.channel?.id !== channelId) return;
      const revision = Math.max(
        snapshot.conversation.revision,
        page.entries.at(-1)?.channelRevision ?? 0,
      );
      if (snapshot.conversation.timeline.hasNewer) {
        clientStore.setConversation({ revision });
        return;
      }
      const merged = mergeLatestWindow(snapshot.conversation.messages, page.entries);
      clientStore.setConversation({
        messages: merged.messages,
        revision,
        timeline: {
          ...snapshot.conversation.timeline,
          olderCursor: merged.keptPrefix
            ? snapshot.conversation.timeline.olderCursor
            : page.olderCursor,
          hasOlder: merged.keptPrefix ? snapshot.conversation.timeline.hasOlder : page.hasOlder,
          hasNewer: false,
        },
      });
    },
    async refreshChannelMessages(channelId, scopedCall = call) {
      const before = clientStore.getSnapshot().conversation.messages;
      const beforeById = new Map(before.map((message) => [message.id, message]));
      const { page, revision } = await loadTimelinePage(scopedCall, channelId);
      const snapshot = clientStore.getSnapshot();
      if (snapshot.conversation.channel?.id !== channelId) return;
      if (revision < snapshot.conversation.revision) return;
      if (snapshot.conversation.timeline.hasNewer) {
        clientStore.setConversation({ revision });
        return;
      }
      const merged = mergeLatestWindow(snapshot.conversation.messages, page.entries);
      const concurrent = snapshot.conversation.messages.filter((message) => {
        const previous = beforeById.get(message.id);
        return (
          previous === undefined ||
          previous.pending !== message.pending ||
          previous.failed !== message.failed
        );
      });
      const concurrentById = new Map(concurrent.map((message) => [message.id, message]));
      const mergedIds = new Set(merged.messages.map((message) => message.id));
      clientStore.setConversation({
        messages: [
          ...merged.messages.map((message) => concurrentById.get(message.id) ?? message),
          ...concurrent.filter((message) => !mergedIds.has(message.id)),
        ],
        revision,
        timeline: {
          ...snapshot.conversation.timeline,
          olderCursor: merged.keptPrefix
            ? snapshot.conversation.timeline.olderCursor
            : page.olderCursor,
          newerCursor: page.newerCursor,
          hasOlder: merged.keptPrefix ? snapshot.conversation.timeline.hasOlder : page.hasOlder,
          hasNewer: page.hasNewer,
        },
      });
    },
  } satisfies ConversationActions;
  return { actions, openChannelById };
}
