import { useCallback, useState, type RefObject } from 'react';
import type { FlatList, LayoutChangeEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import type { ConversationMessage } from '../../host/conversation';
import { useChatScrollAdapter } from '../primitives/chat-scroll';
import { useFollowLatest } from './follow-latest';

export function useChannelViewport<Row>(
  list: RefObject<FlatList<Row> | null>,
  messages: readonly ConversationMessage[],
  onFollowingChange: (following: boolean) => void,
  start: number,
  empty: boolean,
  onLatestChange: (offset: number) => void,
) {
  const latest = useFollowLatest(list, messages, onFollowingChange, start, empty, onLatestChange);
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
    ...latest,
    renderScrollComponent,
    composerHeight,
    viewportHeight,
    viewportLayout,
    onComposerLayout,
    onViewportLayout,
  };
}
