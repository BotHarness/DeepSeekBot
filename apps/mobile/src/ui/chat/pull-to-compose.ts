import { useCallback, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
  ReduceMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { motion } from '../design/tokens';
import { haptic } from '../haptics';
import { atLatest, distanceFromLatest } from './follow-latest';

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

export function pulledPast(offset: number, from: number): number {
  return Math.max(0, offset - from);
}

function measure(event: ScrollEvent) {
  const native = event.nativeEvent;
  return {
    offset: native.contentOffset.y,
    distance: distanceFromLatest({
      content: native.contentSize?.height ?? 0,
      layout: native.layoutMeasurement?.height ?? 0,
      offset: native.contentOffset.y,
    }),
  };
}

export type PullToCompose = {
  progress: SharedValue<number>;
  ready: boolean;
  onScrollBeginDrag(event: ScrollEvent): void;
  onScroll(event: ScrollEvent): void;
  onScrollEndDrag(event: ScrollEvent): void;
};

export function usePullToCompose({
  enabled,
  threshold,
  onCompose,
}: {
  enabled: boolean;
  threshold: number;
  onCompose(): void;
}): PullToCompose {
  const from = useRef<number | undefined>(undefined);
  const past = useRef(false);
  const [ready, setReady] = useState(false);
  const progress = useSharedValue(0);

  const reach = useCallback((next: boolean) => {
    if (next === past.current) return;
    past.current = next;
    setReady(next);
    if (next) haptic('pull');
  }, []);

  const onScrollBeginDrag = useCallback(
    (event: ScrollEvent) => {
      const { offset, distance } = measure(event);
      from.current = enabled && atLatest(distance) ? offset : undefined;
    },
    [enabled],
  );

  const onScroll = useCallback(
    (event: ScrollEvent) => {
      if (from.current === undefined) return;
      const pulled = pulledPast(event.nativeEvent.contentOffset.y, from.current);
      progress.value = Math.min(1, pulled / threshold);
      reach(pulled >= threshold);
    },
    [progress, threshold, reach],
  );

  const onScrollEndDrag = useCallback(
    (event: ScrollEvent) => {
      if (from.current === undefined) return;
      const pulled = pulledPast(event.nativeEvent.contentOffset.y, from.current);
      from.current = undefined;
      progress.value = withTiming(0, {
        duration: motion.composer,
        reduceMotion: ReduceMotion.System,
      });
      reach(false);
      if (enabled && pulled >= threshold) onCompose();
    },
    [enabled, threshold, onCompose, progress, reach],
  );

  return { progress, ready, onScrollBeginDrag, onScroll, onScrollEndDrag };
}
