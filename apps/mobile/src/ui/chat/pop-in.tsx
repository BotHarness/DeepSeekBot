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

import { motion } from '../design/tokens';
import { useMounted } from '../mounted';

export function usePopIn(enabled: boolean, show = true, onHidden?: () => void) {
  const reduced = useReducedMotion();
  const appear = useSharedValue(enabled && !reduced ? 0 : 1);
  const style = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ scale: 0.6 + 0.4 * appear.value }],
  }));
  const ref = useMounted<ViewInstance>(() => {
    if (show) {
      if (appear.value < 1)
        appear.value = withTiming(1, { duration: motion.bubble, easing: Easing.out(Easing.quad) });
      return;
    }
    if (reduced || onHidden === undefined) {
      appear.value = 0;
      onHidden?.();
      return;
    }
    appear.value = withTiming(
      0,
      { duration: motion.badgeExit, easing: Easing.in(Easing.quad) },
      (finished) => {
        if (finished === true) scheduleOnRN(onHidden);
      },
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
  const pop = usePopIn(enabled, show, onHidden);
  return (
    <Animated.View style={[style, pop.style]}>
      <View ref={pop.ref}>{children}</View>
    </Animated.View>
  );
}
