import { use } from 'react';
import { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HistoryChromeContext } from '../chat/history-chrome-context';

export function useComposerDrop(island: number, { toEdge = false } = {}) {
  const history = use(HistoryChromeContext);
  const safeBottom = useSafeAreaInsets().bottom;
  const drop = island > 0 ? Math.max(0, island - (toEdge ? 0 : safeBottom)) : 0;
  return useAnimatedStyle(() => ({
    transform: [{ translateY: (history?.hidden.value ?? 0) * drop }],
  }));
}
