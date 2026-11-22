import { useScopedRef, useScopedState } from '../../scoped-state.js';
import {
  flySentBubble,
  sendFlightExpired,
  sentMessageId,
  type SendFlight,
} from '../../send-fly.js';
import type { WindowCompanions } from '../../window-companions.js';
import { COMPANION_READ_INSET } from '../../companion-surface.js';
import { useRef } from 'react';
import type { BridgeActions } from '../../actions.js';
import type { ChannelMessage, ClientStore, ConversationState } from '../../store.js';
import { useMountedResource } from '../../mounted-resource.js';
import {
  followsLatest,
  rememberTimelineScroll,
  rememberedTimelineScroll,
  restoreTimelineScroll,
  timelineScrollAnchor,
} from '../../timeline-position.js';
import { reportFailure } from '../../diagnostic-log.js';
import { committedMessageIds } from './conversation-timeline.js';
import type { TimelineWindow } from '../../timeline-window.js';

export function useTimelineScrollState({
  scopeKey,
  companion,
  store,
}: {
  scopeKey: string;
  companion: WindowCompanions | undefined;
  store: ClientStore;
}) {
  const followingLatest = useScopedRef(scopeKey, true);
  const lastTimelineTop = useScopedRef(scopeKey, 0);
  const sendFlight = useScopedRef<SendFlight | undefined>(scopeKey, undefined);
  const pinTimelineToLatest = (element: HTMLElement): void => {
    element.scrollTop = element.scrollHeight;
    lastTimelineTop.current = element.scrollTop;
  };
  const companionReadMount = useMountedResource<HTMLElement>(
    (pane) => {
      let visible: boolean | undefined;
      const sync = () => {
        const next = (companion?.getSnapshot().companions.length ?? 0) > 0;
        if (visible === next) return;
        visible = next;
        if (next) pane.style.setProperty('--bh-companion-read-inset', COMPANION_READ_INSET + 'px');
        else pane.style.removeProperty('--bh-companion-read-inset');
        const timeline = pane.querySelector<HTMLElement>('.bh-chat-body');
        if (
          timeline &&
          followingLatest.current &&
          !store.getSnapshot().conversation.timeline.hasNewer
        ) {
          pinTimelineToLatest(timeline);
        }
      };
      sync();
      return companion?.subscribe(sync);
    },
    [companion, scopeKey],
  );
  const prependAnchor = useScopedRef<{
    firstId: string | undefined;
    y: number | undefined;
    top: number;
    height: number;
  } | null>(scopeKey, null);
  const lastRevision = useScopedRef<number | undefined>(scopeKey, undefined);
  const positioned = useScopedRef(scopeKey, false);
  const restoredScroll = useScopedRef(scopeKey, false);
  const placedUnreadDivider = useScopedRef<string | undefined>(scopeKey, undefined);
  const readMarkTimer = useScopedRef<number | undefined>(scopeKey, undefined);
  const [unseen, setUnseen] = useScopedState(scopeKey, 0);
  const [atLatest, setAtLatest] = useScopedState(scopeKey, true);
  return {
    followingLatest,
    lastTimelineTop,
    sendFlight,
    pinTimelineToLatest,
    companionReadMount,
    prependAnchor,
    lastRevision,
    positioned,
    restoredScroll,
    placedUnreadDivider,
    readMarkTimer,
    unseen,
    setUnseen,
    atLatest,
    setAtLatest,
  };
}

export function useTimelineReadMark({
  channelId,
  scrollRef,
  conversation,
  readMarkTimer,
  messages,
  actions,
}: {
  channelId: string | undefined;
  scrollRef: { current: HTMLDivElement | null };
  conversation: ConversationState;
  readMarkTimer: { current: number | undefined };
  messages: readonly ChannelMessage[];
  actions: BridgeActions;
}) {
  const scheduleReadMark = (): void => {
    if (channelId === undefined || scrollRef.current === null || conversation.status !== 'ready')
      return;
    window.clearTimeout(readMarkTimer.current);
    readMarkTimer.current = window.setTimeout(() => {
      const element = scrollRef.current;
      if (currentChannel.current !== channelId || element === null) return;
      const committedIds = committedMessageIds(messages);
      const bounds = element.getBoundingClientRect();
      const overlay =
        Number.parseFloat(getComputedStyle(element).getPropertyValue('--bh-composer-overlay')) || 0;
      const viewport = { top: bounds.top, bottom: bounds.bottom - overlay };
      const visible = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]'))
        .filter((candidate) => {
          const id = candidate.dataset['messageId'];
          if (id === undefined || !committedIds.has(id)) return false;
          const bounds = candidate.getBoundingClientRect();
          return bounds.top < viewport.bottom && bounds.bottom > viewport.top;
        })
        .at(-1);
      const messageId = visible?.dataset['messageId'];
      if (messageId === undefined) return;
      void actions.markRead(channelId, messageId).catch((error: unknown) => {
        reportFailure('channel-read-position-failed', 'channel read position failed', error);
      });
    }, 250);
  };

  const currentChannel = useRef(channelId);
  currentChannel.current = channelId;
  return { scheduleReadMark, currentChannel };
}

export function createTimelinePagination({
  scrollRef,
  channelId,
  conversation,
  prependAnchor,
  messages,
  actions,
}: {
  scrollRef: { current: HTMLDivElement | null };
  channelId: string | undefined;
  conversation: ConversationState;
  prependAnchor: ReturnType<typeof useTimelineScrollState>['prependAnchor'];
  messages: readonly ChannelMessage[];
  actions: BridgeActions;
}) {
  const loadOlderAtTop = (retry = false): void => {
    const element = scrollRef.current;
    if (
      element === null ||
      channelId === undefined ||
      !conversation.timeline.hasOlder ||
      conversation.timeline.loadingOlder ||
      (!retry && conversation.timeline.olderError !== undefined) ||
      prependAnchor.current !== null
    )
      return;
    prependAnchor.current = {
      firstId: messages[0]?.id,
      y: element.querySelector<HTMLElement>('[data-message-id]')?.getBoundingClientRect().top,
      top: element.scrollTop,
      height: element.scrollHeight,
    };
    void actions.loadOlder(channelId);
  };

  const loadNewerAtBottom = (): void => {
    if (
      channelId === undefined ||
      !conversation.timeline.hasNewer ||
      conversation.timeline.loadingNewer ||
      conversation.timeline.newerError !== undefined
    )
      return;
    void actions.loadNewer(channelId);
  };
  return { loadOlderAtTop, loadNewerAtBottom };
}

export function useTimelineScrolling({
  conversation,
  scrollRef,
  timelineWindow,
  messages,
  unreadAfter,
  channelId,
  store,
  loadOlderAtTop,
  loadNewerAtBottom,
  scheduleReadMark,
  scopeKey,
  actions,
  scrollState: {
    followingLatest,
    lastTimelineTop,
    sendFlight,
    pinTimelineToLatest,
    prependAnchor,
    lastRevision,
    positioned,
    restoredScroll,
    placedUnreadDivider,
    setUnseen,
    setAtLatest,
  },
}: {
  conversation: ConversationState;
  scrollRef: { current: HTMLDivElement | null };
  timelineWindow: TimelineWindow;
  messages: readonly ChannelMessage[];
  unreadAfter: string | undefined;
  channelId: string | undefined;
  store: ClientStore;
  loadOlderAtTop: (retry?: boolean) => void;
  loadNewerAtBottom: () => void;
  scheduleReadMark: () => void;
  scopeKey: string;
  actions: BridgeActions;
  scrollState: Pick<
    ReturnType<typeof useTimelineScrollState>,
    | 'followingLatest'
    | 'lastTimelineTop'
    | 'sendFlight'
    | 'pinTimelineToLatest'
    | 'prependAnchor'
    | 'lastRevision'
    | 'positioned'
    | 'restoredScroll'
    | 'placedUnreadDivider'
    | 'setUnseen'
    | 'setAtLatest'
  >;
}) {
  const placeUnreadDivider = (element: HTMLDivElement): boolean => {
    const divider = element.querySelector<HTMLElement>('[data-unread-divider]');
    if (divider === null) return false;
    const viewport = element.getBoundingClientRect();
    element.scrollTop += divider.getBoundingClientRect().top - viewport.top - viewport.height / 4;
    lastTimelineTop.current = element.scrollTop;
    followingLatest.current =
      !conversation.timeline.hasNewer &&
      element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
    setAtLatest(followingLatest.current);
    return true;
  };

  const timelineMount = useMountedResource<HTMLDivElement>(
    (element) => {
      scrollRef.current = element;
      timelineWindow.rootRef(element);
      if (conversation.timeline.olderError !== undefined) prependAnchor.current = null;
      if (conversation.status === 'ready') {
        if (conversation.focusMessageId !== undefined && conversation.timeline.hasNewer) {
          followingLatest.current = false;
          setAtLatest(false);
        }
        const anchor = prependAnchor.current;
        if (anchor !== null && messages[0]?.id !== anchor.firstId) {
          const retained = Array.from(
            element.querySelectorAll<HTMLElement>('[data-message-id]'),
          ).find((candidate) => candidate.dataset['messageId'] === anchor.firstId);
          if (retained !== undefined && anchor.y !== undefined) {
            element.scrollTop += retained.getBoundingClientRect().top - anchor.y;
          } else {
            element.scrollTop = anchor.top + element.scrollHeight - anchor.height;
          }
          lastTimelineTop.current = element.scrollTop;
          prependAnchor.current = null;
        } else if (
          unreadAfter !== undefined &&
          placedUnreadDivider.current !== unreadAfter &&
          !restoredScroll.current &&
          conversation.focusMessageId === undefined &&
          placeUnreadDivider(element)
        ) {
          placedUnreadDivider.current = unreadAfter;
          positioned.current = true;
        } else if (
          !positioned.current &&
          conversation.focusMessageId === undefined &&
          messages.length > 0
        ) {
          positioned.current = true;
          const saved = channelId === undefined ? undefined : rememberedTimelineScroll(channelId);
          if (saved !== undefined && !saved.atLatest && restoreTimelineScroll(element, saved)) {
            restoredScroll.current = true;
            lastTimelineTop.current = element.scrollTop;
            followingLatest.current = false;
            setAtLatest(false);
          } else if (followingLatest.current) pinTimelineToLatest(element);
        } else if (followingLatest.current) {
          pinTimelineToLatest(element);
        }
        const previousRevision = lastRevision.current;
        if (
          previousRevision !== undefined &&
          conversation.revision > previousRevision &&
          !followingLatest.current
        ) {
          setUnseen((count) => count + conversation.revision - previousRevision);
        }
        lastRevision.current = conversation.revision;
        const flight = sendFlight.current;
        const sentId = flight === undefined ? undefined : sentMessageId(flight, messages);
        if (flight !== undefined && sentId === undefined && sendFlightExpired(flight))
          sendFlight.current = undefined;
        if (flight !== undefined && sentId !== undefined) {
          sendFlight.current = undefined;
          const bubble = element.querySelector<HTMLElement>(
            `[data-message-id="${CSS.escape(sentId)}"] .bh-bubble`,
          );
          if (bubble !== null && followingLatest.current) flySentBubble(bubble, flight.from);
        }
      }
      const id = conversation.focusMessageId;
      let focusTimer: number | undefined;
      if (id !== undefined) {
        positioned.current = true;
        const target = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find(
          (candidate) => candidate.dataset['messageId'] === id,
        );
        target?.scrollIntoView({ block: 'center' });
        lastTimelineTop.current = element.scrollTop;
        focusTimer = window.setTimeout(() => {
          const current = store.getSnapshot().conversation;
          if (current.channel?.id === channelId && current.focusMessageId === id) {
            store.setConversation({ focusMessageId: undefined });
          }
        }, 2200);
      }
      const frame = window.requestAnimationFrame(() => {
        if (element.scrollHeight <= element.clientHeight + 1) {
          loadOlderAtTop();
          loadNewerAtBottom();
        }
        if (conversation.status === 'ready') scheduleReadMark();
      });
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(focusTimer);
        scrollRef.current = null;
      };
    },
    [
      scopeKey,
      actions,
      channelId,
      conversation.status,
      conversation.drafts,
      conversation.revision,
      conversation.focusMessageId,
      unreadAfter,
      conversation.timeline.hasOlder,
      conversation.timeline.hasNewer,
      conversation.timeline.loadingOlder,
      conversation.timeline.loadingNewer,
      conversation.timeline.olderError,
      conversation.timeline.newerError,
      messages,
    ],
  );

  const onTimelineScroll = (): void => {
    const element = scrollRef.current;
    if (element === null) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
    followingLatest.current = followsLatest(
      element,
      lastTimelineTop.current,
      conversation.timeline.hasNewer,
    );
    lastTimelineTop.current = element.scrollTop;
    setAtLatest(followingLatest.current);
    if (followingLatest.current) setUnseen(0);
    if (channelId !== undefined && conversation.status === 'ready' && positioned.current) {
      const position = timelineScrollAnchor(element, followingLatest.current);
      if (position !== undefined) rememberTimelineScroll(channelId, position);
    }
    scheduleReadMark();
    if (element.scrollTop <= 48) loadOlderAtTop();
    if (atBottom) loadNewerAtBottom();
  };

  const jumpToLatest = (): void => {
    followingLatest.current = true;
    setAtLatest(true);
    setUnseen(0);
    if (conversation.timeline.hasNewer && channelId !== undefined) {
      void actions.openLatest(channelId).catch((error: unknown) => {
        reportFailure('latest-timeline-reload-failed', 'latest timeline reload failed', error);
      });
      return;
    }
    const element = scrollRef.current;
    if (element !== null) pinTimelineToLatest(element);
  };
  return { timelineMount, onTimelineScroll, jumpToLatest };
}
