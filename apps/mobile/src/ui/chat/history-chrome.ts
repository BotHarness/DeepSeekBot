import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, type NativeScrollEvent } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import { tabChrome } from '../design/tokens';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { chromeScroll, chromeShown, useTabChrome, type ChromeScroll } from '../shell/tab-chrome';
import type { HistoryChrome } from './history-chrome-context';

export function historyDistance(
  event: {
    contentOffset: { y: number };
    contentSize: { height: number };
    layoutMeasurement: { height: number };
    contentInset?: { top: number; bottom: number } | undefined;
  },
  inverted: boolean,
): { distance: number; end: number } {
  const top = event.contentInset?.top ?? 0;
  const bottom = event.contentInset?.bottom ?? 0;
  const end = Math.max(0, event.contentSize.height - event.layoutMeasurement.height + top + bottom);
  const offset = event.contentOffset.y + (inverted ? 0 : top);
  const distance = inverted ? offset : end - offset;
  return { distance: Math.min(end, Math.max(0, distance)), end };
}

let reader = false;
const readScreenReader = () => reader;
function subscribeScreenReader(notify: () => void) {
  let live = true;
  let changed = false;
  const listener = AccessibilityInfo.addEventListener('screenReaderChanged', (next: boolean) => {
    changed = true;
    reader = next;
    notify();
  });
  void AccessibilityInfo.isScreenReaderEnabled().then(
    (next) => {
      if (!live || changed) return;
      reader = next;
      notify();
    },
    () => {},
  );
  return () => {
    live = false;
    listener.remove();
  };
}

function useScreenReader(): boolean {
  return useSyncExternalStore(subscribeScreenReader, readScreenReader);
}

export function useHistoryChrome({
  enabled,
  inverted,
}: {
  enabled: boolean;
  inverted: boolean;
}): HistoryChrome {
  const chrome = useTabChrome();
  const reduced = useSystemReducedMotion();
  const reader = useScreenReader();
  const hidden = useSharedValue(0);
  const state = useRef<ChromeScroll>(chromeShown);
  const [hiddenNow, setHiddenNow] = useState(false);
  const active = enabled && chrome !== undefined && !reader;
  const move = useCallback(
    (next: boolean) => {
      const target = next ? 1 : 0;
      const value = reduced ? target : withTiming(target, { duration: tabChrome.hideDuration });
      hidden.value = value;
      if (chrome) chrome.hidden.value = value;
      setHiddenNow(next);
    },
    [chrome, hidden, reduced],
  );
  const show = useCallback(() => {
    const was = state.current.hidden;
    state.current = chromeShown;
    if (was) move(false);
  }, [move]);
  useLayoutEffect(() => {
    if (!active) show();
    return show;
  }, [active, show]);
  const onScroll = useCallback(
    (event: NativeScrollEvent) => {
      if (!active) return;
      const { distance, end } = historyDistance(event, inverted);
      const was = state.current.hidden;
      state.current = chromeScroll(state.current, distance, end);
      if (state.current.hidden !== was) move(state.current.hidden);
    },
    [active, inverted, move],
  );
  return { hidden, hiddenNow, reduced, onScroll, onScrollToTop: show };
}
