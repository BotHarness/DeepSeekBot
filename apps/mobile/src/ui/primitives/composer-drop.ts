import { use } from 'react';
import { Platform } from 'react-native';
import { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HistoryChromeContext } from '../chat/history-chrome-context';

export function composerDrop(island: number, safeBottom: number, hiddenNow: boolean) {
  const drop = island > 0 ? Math.max(0, island - safeBottom) : 0;
  return { drop, settled: hiddenNow ? drop : 0 };
}

export function footerShift(drop: number, settled: number, hidden: number): number {
  'worklet';
  return hidden * drop - settled;
}

function useDrop(island: number) {
  const history = use(HistoryChromeContext);
  const safeBottom = useSafeAreaInsets().bottom;
  return { history, ...composerDrop(island, safeBottom, history?.hiddenNow ?? false) };
}

export function useComposerDrop(island: number) {
  const { history, drop, settled } = useDrop(island);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: footerShift(drop, settled, history?.hidden.value ?? 0) }],
  }));
  return { style, settled };
}

export function useOverlaySettle(island: number, hiddenNow: boolean) {
  const { settled } = composerDrop(island, useSafeAreaInsets().bottom, hiddenNow);
  return Platform.OS === 'android' ? { marginBottom: -settled } : undefined;
}

export function useBottomFadeDrop(island: number) {
  const { history, settled } = useDrop(island);
  return useAnimatedStyle(() => ({
    transform: [{ translateY: footerShift(island, settled, history?.hidden.value ?? 0) }],
  }));
}
