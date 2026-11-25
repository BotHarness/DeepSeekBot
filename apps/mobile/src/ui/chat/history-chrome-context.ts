import { createContext } from 'react';
import type { NativeScrollEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export type HistoryChrome = {
  hidden: SharedValue<number>;
  hiddenNow: boolean;
  reduced: boolean;
  onScroll(event: NativeScrollEvent): void;
  onScrollToTop(): void;
};

export const HistoryChromeContext = createContext<HistoryChrome | undefined>(undefined);
