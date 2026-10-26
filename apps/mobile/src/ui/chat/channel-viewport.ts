import { useCallback, useState, type RefObject } from 'react';
import type { FlatList, LayoutChangeEvent } from 'react-native';
import {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { ConversationMessage } from '../../host/conversation';
import { useChatScrollAdapter, useChatOverlayStyle } from '../primitives/chat-scroll';
import { anchorShift, anchorStep, useFollowLatest } from './follow-latest';

export function useChannelViewport<Row>(
  list: RefObject<FlatList<Row> | null>,
  messages: readonly ConversationMessage[],
  scroll: SharedValue<number>,
  onFollowingChange: ((following: boolean) => void) | undefined,
  start: number,
  empty: boolean,
) {
  const followingLatest = useSharedValue(true);
  const latestEnd = useSharedValue(0);
  const workingAnchor = useSharedValue(0);
  const followChange = useCallback(
    (following: boolean) => {
      followingLatest.value = following;
      onFollowingChange?.(following);
    },
    [followingLatest, onFollowingChange],
  );
  const latestChange = useCallback(
    (offset: number) => {
      latestEnd.value = offset;
    },
    [latestEnd],
  );
  useAnimatedReaction(
    () => [scroll.value, latestEnd.value, followingLatest.value] as const,
    ([offset, end, following]) => {
      workingAnchor.value = anchorStep(workingAnchor.value, offset, end, following);
    },
  );
  const workingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: anchorShift(workingAnchor.value, scroll.value) }],
  }));
  const latest = useFollowLatest(list, messages, followChange, start, empty, latestChange);
  const overlayStyle = useChatOverlayStyle();
  const renderScrollComponent = useChatScrollAdapter(latest.keyboard, latest.away);
  const [composerHeight, setComposerHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const viewportLayout = useSharedValue(0);
  const onComposerLayout = useCallback((event: LayoutChangeEvent) => {
    setComposerHeight(event.nativeEvent.layout.height);
  }, []);
  const onViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportLayout.value += 1;
      setViewportHeight(event.nativeEvent.layout.height);
    },
    [viewportLayout],
  );
  return {
    away: latest.away,
    ready: latest.ready,
    canRetry: latest.canRetry,
    retry: latest.retry,
    browsed: latest.browsed,
    unseen: latest.unseen,
    hold: latest.hold,
    jumpToLatest: latest.jumpToLatest,
    listProps: latest.listProps,
    workingStyle,
    renderScrollComponent,
    overlayStyle,
    composerHeight,
    viewportHeight,
    viewportLayout,
    onComposerLayout,
    onViewportLayout,
  };
}
