import { useCallback, useState, type RefObject } from 'react';
import type { FlatList, LayoutChangeEvent } from 'react-native';
import { useSharedValue, useReducedMotion } from 'react-native-reanimated';

import type { ConversationMessage } from '../../host/conversation';
import { useChatScrollAdapter, useChatOverlayStyle } from '../primitives/chat-scroll';
import { useFollowLatest } from './follow-latest';

export function useChannelViewport<Row>(
  list: RefObject<FlatList<Row> | null>,
  messages: readonly ConversationMessage[],
  onFollowingChange: ((following: boolean) => void) | undefined,
  start: number,
  empty: boolean,
  minIndexForVisible = 0,
) {
  const reducedMotion = useReducedMotion();
  const latest = useFollowLatest(
    list,
    messages,
    onFollowingChange,
    start,
    empty,
    !reducedMotion,
    minIndexForVisible,
  );
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
    renderScrollComponent,
    overlayStyle,
    composerHeight,
    viewportHeight,
    viewportLayout,
    onComposerLayout,
    onViewportLayout,
  };
}
