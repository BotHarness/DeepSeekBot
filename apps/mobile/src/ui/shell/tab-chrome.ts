import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useState } from 'react';
import {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scrollChrome, tabChrome } from '../design/tokens';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';

export type TabChrome = {
  hidden: SharedValue<number>;
  islandTop: number;
};

export const TabChromeContext = createContext<TabChrome | undefined>(undefined);

export function useTabChrome(): TabChrome | undefined {
  return useContext(TabChromeContext);
}

export type ChromeScroll = { last: number; travel: number; hidden: boolean };

export const chromeShown: ChromeScroll = { last: Number.NaN, travel: 0, hidden: false };

export function chromeScroll(previous: ChromeScroll, offset: number, end: number): ChromeScroll {
  'worklet';
  if (offset <= scrollChrome.top) return { last: offset, travel: 0, hidden: false };
  if (offset >= end) return { ...previous, last: Math.min(offset, end) };
  const step = Number.isNaN(previous.last) ? 0 : offset - previous.last;
  const travel =
    step === 0 || Math.sign(step) === Math.sign(previous.travel) ? previous.travel + step : step;
  const hidden =
    travel > scrollChrome.threshold
      ? true
      : travel < -scrollChrome.threshold
        ? false
        : previous.hidden;
  return { last: offset, travel, hidden };
}

export function useChromeHidden(hidden: SharedValue<number> | undefined): boolean {
  const [state, setState] = useState(false);
  useAnimatedReaction(
    () => (hidden?.value ?? 0) > 0.5,
    (next, previous) => {
      if (next !== previous) runOnJS(setState)(next);
    },
  );
  return state;
}

export function useHideChromeOnScroll(enabled: boolean) {
  const chrome = useTabChrome();
  const reduced = useSystemReducedMotion();
  const state = useSharedValue<ChromeScroll>(chromeShown);
  const show = useCallback(() => {
    state.value = chromeShown;
    if (chrome) chrome.hidden.value = 0;
  }, [chrome, state]);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) show();
      return show;
    }, [enabled, show]),
  );
  return useAnimatedScrollHandler({
    onScroll(event) {
      if (chrome === undefined) return;
      const offset = event.contentOffset.y + event.contentInset.top;
      const end = Math.max(
        0,
        event.contentSize.height - event.layoutMeasurement.height + event.contentInset.bottom,
      );
      const next = enabled ? chromeScroll(state.value, offset, end) : chromeShown;
      const was = state.value.hidden;
      state.value = next;
      if (next.hidden === was) return;
      const target = next.hidden ? 1 : 0;
      chrome.hidden.value = reduced
        ? target
        : withTiming(target, { duration: tabChrome.hideDuration });
    },
  });
}

export function useHideChromeWhile(hidden: boolean) {
  const chrome = useTabChrome();
  const reduced = useSystemReducedMotion();
  useFocusEffect(
    useCallback(() => {
      if (chrome === undefined || !hidden) return;
      const move = (target: number) => {
        chrome.hidden.value = reduced
          ? target
          : withTiming(target, { duration: tabChrome.hideDuration });
      };
      move(1);
      return () => move(0);
    }, [chrome, hidden, reduced]),
  );
}
