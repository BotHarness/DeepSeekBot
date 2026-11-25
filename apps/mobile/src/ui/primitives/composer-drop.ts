import { use } from 'react';
import { Platform } from 'react-native';
import { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HistoryChromeContext } from '../chat/history-chrome-context';

export function useComposerDrop(island: number) {
  const history = use(HistoryChromeContext);
  const safeBottom = useSafeAreaInsets().bottom;
  const drop = island > 0 ? Math.max(0, island - safeBottom) : 0;
  const settled = history?.hiddenNow ? drop : 0;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (history?.hidden.value ?? 0) * drop - settled }],
  }));
  return { style, settled };
}

export function useBottomFadeDrop(island: number) {
  const history = use(HistoryChromeContext);
  const safeBottom = useSafeAreaInsets().bottom;
  const framed = Platform.OS === 'ios' && history?.hiddenNow ? Math.max(0, island - safeBottom) : 0;
  return useAnimatedStyle(() => ({
    transform: [{ translateY: (history?.hidden.value ?? 0) * island - framed }],
  }));
}
