import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewInstance, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { easeOut, motion, popScale } from '../design/tokens';
import { useMounted } from '../mounted';

const EASE_OUT = Easing.bezier(...easeOut);

export function usePopIn(
  enabled: boolean,
  {
    show = true,
    onHidden,
    from = popScale.bubble,
    duration = motion.bubble,
    exit = motion.badgeExit,
  }: {
    show?: boolean;
    onHidden?: (() => void) | undefined;
    from?: number;
    duration?: number;
    exit?: number;
  } = {},
) {
  const reduced = useReducedMotion();
  const start = reduced ? 1 : from;
  const appear = useSharedValue(enabled ? 0 : 1);
  const style = useAnimatedStyle(() => ({
    opacity: appear.get(),
    transform: [{ scale: start + (1 - start) * appear.get() }],
  }));
  const ref = useMounted<ViewInstance>(() => {
    if (show) {
      if (appear.get() < 1) appear.set(withTiming(1, { duration, easing: EASE_OUT }));
      return;
    }
    if (onHidden === undefined) {
      appear.set(0);
      return;
    }
    appear.set(
      withTiming(0, { duration: exit, easing: EASE_OUT }, (finished) => {
        if (finished === true) scheduleOnRN(onHidden);
      }),
    );
  }, [show]);
  return { ref, style };
}

export function PopIn({
  enabled,
  show = true,
  onHidden,
  style,
  children,
}: {
  enabled: boolean;
  show?: boolean;
  onHidden?: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const pop = usePopIn(enabled, {
    show,
    onHidden,
    from: popScale.badge,
    duration: motion.badge,
  });
  return (
    <Animated.View style={[style, pop.style]}>
      <View ref={pop.ref}>{children}</View>
    </Animated.View>
  );
}
