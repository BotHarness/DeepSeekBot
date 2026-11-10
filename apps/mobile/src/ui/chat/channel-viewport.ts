import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import type { FlatList, LayoutChangeEvent } from 'react-native';
import { useSharedValue, useReducedMotion } from 'react-native-reanimated';

import type { ConversationMessage } from '../../host/conversation';
import { useChatScrollAdapter, useChatOverlayStyle } from '../primitives/chat-scroll';
import { useFollowLatest } from './follow-latest';
import type { ComposerPill } from './composer-pill';
import { LatestAnchor } from './latest-anchor';

export function useChannelViewport<Row>(
  list: RefObject<Pick<FlatList<Row>, 'scrollToOffset'> | null>,
  messages: readonly ConversationMessage[],
  onFollowingChange: ((following: boolean) => void) | undefined,
  start: number,
  empty: boolean,
  minIndexForVisible = 0,
  inverted = false,
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
    inverted,
    LatestAnchor !== undefined,
  );
  const overlayStyle = useChatOverlayStyle();
  const renderScrollComponent = useChatScrollAdapter(latest.keyboard, latest.away);
  const [composerHeight, setComposerHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const viewportLayout = useSharedValue(0);
  const pillHeight = useSharedValue(0);
  const chrome = useSharedValue(0);
  const composerSizes = useRef({ frame: 0, pill: 0 });
  const onComposerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      setComposerHeight(height);
      composerSizes.current.frame = height;
      chrome.set(height - composerSizes.current.pill);
    },
    [chrome],
  );
  const pill = useMemo<ComposerPill>(
    () => ({
      height: pillHeight,
      chrome,
      layout(height) {
        composerSizes.current.pill = height;
        chrome.set(composerSizes.current.frame - height);
      },
    }),
    [pillHeight, chrome],
  );
  const onViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportLayout.value += 1;
      setViewportHeight(event.nativeEvent.layout.height);
    },
    [viewportLayout],
  );
  return {
    reducedMotion,
    away: latest.away,
    ready: latest.ready,
    canRetry: latest.canRetry,
    retry: latest.retry,
    browsed: latest.browsed,
    unseen: latest.unseen,
    hold: latest.hold,
    jumpToLatest: latest.jumpToLatest,
    send: latest.send,
    listProps: latest.listProps,
    renderScrollComponent,
    overlayStyle,
    composerHeight,
    viewportHeight,
    viewportLayout,
    onComposerLayout,
    onViewportLayout,
    pill,
  };
}
