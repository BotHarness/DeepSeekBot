import type { ReactNode } from 'react';
import type { StyleProp, ViewInstance, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '../design/tokens';
import { useMounted } from '../mounted';

export function usePopIn(enabled: boolean) {
  const reduced = useReducedMotion();
  const appear = useSharedValue(enabled && !reduced ? 0 : 1);
  const style = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ scale: 0.6 + 0.4 * appear.value }],
  }));
  const ref = useMounted<ViewInstance>(() => {
    if (appear.value < 1)
      appear.value = withTiming(1, { duration: motion.bubble, easing: Easing.out(Easing.quad) });
  }, []);
  return { ref, style };
}

export function PopIn({
  enabled,
  style,
  children,
}: {
  enabled: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const pop = usePopIn(enabled);
  return (
    <Animated.View ref={pop.ref} style={[style, pop.style]}>
      {children}
    </Animated.View>
  );
}
