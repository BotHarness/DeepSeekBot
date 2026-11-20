import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { type ViewInstance } from 'react-native';
import { useAnimatedRef } from 'react-native-reanimated';
import { type ConversationDraftReference } from '@botharness/host-client/conversation';
import { type ChatListHandle } from '../primitives/chat-list';
import { type ChatRow } from './message-groups';
import type { useConversationSource } from './conversation-source';
import type { useConversationTimeline, useConversationTimelineRows } from './conversation-timeline';

export type Row = ChatRow | { kind: 'draft'; key: string; draft: ConversationDraftReference };

export function useConversationScrollState({
  focus,
  focusRequest,
  android,
}: {
  focus: string | undefined;
  focusRequest: string | undefined;
  android: boolean;
}) {
  const list = useRef<ChatListHandle<Row> | null>(null);
  const scrollRef = useAnimatedRef<ViewInstance>();
  const jumped = useRef<string | undefined>(undefined);
  const focusPage = useRef<string | undefined>(undefined);
  const focusCancelled = useRef(false);
  const focusNeedsLayout = useRef(false);
  const focusHasLiveLayout = useRef(false);
  const focusEstimate = useRef<string | undefined>(undefined);
  const focusAttempt = useRef<
    { message: string; request: string | undefined; index: number } | undefined
  >(undefined);
  const [anchoredFocus, setAnchoredFocus] = useState<{
    message: string | undefined;
    request: string | undefined;
  }>();
  const positioningFocus =
    android &&
    focus !== undefined &&
    (anchoredFocus?.message !== focus || anchoredFocus?.request !== focusRequest);
  const retryFocus = useRef<() => void>(() => undefined);
  const onFocusViewabilityChange = useCallback(
    (info?: { viewableItems: Array<{ item: Row; isViewable: boolean }> }) => {
      const attempt = focusAttempt.current;
      if (
        android &&
        focusHasLiveLayout.current &&
        attempt !== undefined &&
        !focusCancelled.current &&
        attempt.message === focusIntent.current.message &&
        attempt.request === focusIntent.current.request &&
        info?.viewableItems.some(
          ({ item, isViewable }) =>
            isViewable && item.kind === 'message' && item.message.id === attempt.message,
        )
      ) {
        setAnchoredFocus({ message: attempt.message, request: attempt.request });
        focusAttempt.current = undefined;
      }
      focusNeedsLayout.current = false;
      retryFocus.current();
    },
    [android],
  );
  const focusIntent = useRef<{ request: string | undefined; message: string | undefined }>({
    request: undefined,
    message: undefined,
  });
  return {
    list,
    scrollRef,
    jumped,
    focusPage,
    focusCancelled,
    focusNeedsLayout,
    focusHasLiveLayout,
    focusEstimate,
    focusAttempt,
    setAnchoredFocus,
    positioningFocus,
    retryFocus,
    onFocusViewabilityChange,
    focusIntent,
  };
}

export function useConversationFocusJump({
  latestWindowOnly,
  focused,
  focus,
  focusRequest,
  source,
  scrollState,
  timeline,
  timelineRows,
}: {
  latestWindowOnly: boolean;
  focused: boolean;
  focus: string | undefined;
  focusRequest: string | undefined;
  source: Pick<ReturnType<typeof useConversationSource>, 'conversation' | 'snapshot'>;
  scrollState: ReturnType<typeof useConversationScrollState>;
  timeline: Pick<ReturnType<typeof useConversationTimeline>, 'latest'>;
  timelineRows: Pick<ReturnType<typeof useConversationTimelineRows>, 'rows'>;
}) {
  const { conversation, snapshot } = source;
  const {
    list,
    jumped,
    focusPage,
    focusCancelled,
    focusNeedsLayout,
    focusHasLiveLayout,
    focusEstimate,
    focusAttempt,
    retryFocus,
    focusIntent,
  } = scrollState;
  const { latest } = timeline;
  const { rows } = timelineRows;
  const firstMessageId = snapshot.messages[0]?.id ?? '';
  const jump = useCallback(() => {
    if (
      !focused ||
      focus === undefined ||
      focusCancelled.current ||
      focusNeedsLayout.current ||
      jumped.current === focus ||
      focusIntent.current.message !== focus ||
      focusIntent.current.request !== focusRequest
    )
      return;
    const index = rows.findIndex((row) => row.kind === 'message' && row.message.id === focus);
    if (index >= 0) {
      if (!list.current) return;
      jumped.current = focus;
      focusAttempt.current = { message: focus, request: focusRequest, index };
      latest.hold();
      list.current.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    } else if (latestWindowOnly && snapshot.status === 'live') jumped.current = focus;
    else if (
      snapshot.status === 'live' &&
      snapshot.hasOlder &&
      !snapshot.loadingOlder &&
      !snapshot.olderError &&
      conversation !== undefined &&
      !snapshot.fromCache &&
      focusPage.current !== firstMessageId
    ) {
      focusPage.current = firstMessageId;
      void conversation.loadOlder();
    }
  }, [
    focused,
    focus,
    focusRequest,
    rows,
    list,
    latest.hold,
    latestWindowOnly,
    snapshot.status,
    snapshot.hasOlder,
    snapshot.loadingOlder,
    snapshot.olderError,
    snapshot.fromCache,
    firstMessageId,
    conversation,
  ]);

  useLayoutEffect(() => {
    retryFocus.current = jump;
    if (!focused) return;
    const previous = focusIntent.current;
    if (previous.message !== focus || previous.request !== focusRequest) {
      focusIntent.current = { request: focusRequest, message: focus };
      jumped.current = undefined;
      focusPage.current = undefined;
      focusCancelled.current = false;
      focusNeedsLayout.current = false;
      focusHasLiveLayout.current = false;
      focusEstimate.current = undefined;
      focusAttempt.current = undefined;
    }
    jump();
  }, [focused, focus, focusRequest, jump]);
  return { jump };
}
