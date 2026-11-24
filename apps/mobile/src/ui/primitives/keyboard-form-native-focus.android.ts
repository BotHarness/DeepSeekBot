import { useCallback, useRef, type Ref } from 'react';
import type { ViewInstance } from 'react-native';
import {
  useReanimatedKeyboardAnimation,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import {
  measure,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useScrollOffset,
  useSharedValue,
} from 'react-native-reanimated';

import { revealSnap } from './keyboard-form-context';

export function useNativeFormScroll(
  forwardedRef: Ref<KeyboardAwareScrollViewRef> | undefined,
  enabled: boolean,
  bottomOffset: number,
  snaps: readonly number[] = [],
) {
  const scroll = useAnimatedRef<KeyboardAwareScrollViewRef>();
  const offset = useScrollOffset(scroll);
  const { height, progress } = useReanimatedKeyboardAnimation();
  const inputBottom = useSharedValue(0);
  const active = useRef<ViewInstance | undefined>(undefined);
  const focus = useCallback(
    (node: ViewInstance, focused: boolean) => {
      if (!enabled) return;
      if (!focused) {
        if (active.current === node) {
          active.current = undefined;
          inputBottom.set(0);
        }
        return;
      }
      active.current = node;
      node.measureInWindow((_x, y, _width, fieldHeight) => {
        if (active.current === node) inputBottom.set(y + fieldHeight + offset.get());
      });
    },
    [enabled, inputBottom, offset],
  );
  useAnimatedReaction(
    () => ({ keyboard: height.get(), bottom: inputBottom.get() }),
    ({ keyboard, bottom }) => {
      if (!enabled || keyboard >= 0 || bottom === 0) return;
      const viewport = measure(scroll);
      if (!viewport) return;
      const overlap =
        bottom - offset.get() - (viewport.pageY + viewport.height + keyboard - bottomOffset);
      if (overlap > 0) scrollTo(scroll, 0, offset.get() + overlap, false);
    },
    [enabled, bottomOffset],
  );
  useAnimatedReaction(
    () => progress.get() === 1 && inputBottom.get() !== 0,
    (open, wasOpen) => {
      if (!enabled || !open || wasOpen) return;
      const next = revealSnap(offset.get(), snaps);
      if (next !== undefined) scrollTo(scroll, 0, next, true);
    },
    [enabled, snaps],
  );
  const ref = useCallback(
    (node: KeyboardAwareScrollViewRef | null) => {
      scroll(node);
      if (typeof forwardedRef === 'function') return forwardedRef(node);
      if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef, scroll],
  );
  return { ref, focus: enabled ? focus : undefined };
}
