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

export function useNativeFormScroll(
  forwardedRef: Ref<KeyboardAwareScrollViewRef> | undefined,
  enabled: boolean,
  bottomOffset: number,
) {
  const scroll = useAnimatedRef<KeyboardAwareScrollViewRef>();
  const offset = useScrollOffset(scroll);
  const { height } = useReanimatedKeyboardAnimation();
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
