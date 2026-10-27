import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewInstance, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { spring } from '../design/motion';
import { popScale } from '../design/tokens';
import { useMounted } from '../mounted';

export function usePopIn(
  enabled: boolean,
  {
    show = true,
    onHidden,
    from = popScale.bubble,
  }: {
    show?: boolean;
    onHidden?: (() => void) | undefined;
    from?: number;
  } = {},
) {
  const reduced = useReducedMotion();
  const start = reduced ? 1 : from;
  const opacity = useSharedValue(enabled ? 0 : 1);
  const grow = useSharedValue(enabled ? 0 : 1);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: start + (1 - start) * grow.get() }],
  }));
  const ref = useMounted<ViewInstance>(() => {
    if (show) {
      if (opacity.get() < 1) opacity.set(withSpring(1, spring.effects.fast));
      if (grow.get() < 1) grow.set(withSpring(1, spring.spatial.fast));
      return;
    }
    if (onHidden === undefined) {
      opacity.set(0);
      grow.set(0);
      return;
    }
    grow.set(withSpring(0, spring.effects.fast));
    opacity.set(
      withSpring(0, spring.effects.fast, (finished) => {
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
  });
  return (
    <Animated.View style={[style, pop.style]}>
      <View ref={pop.ref}>{children}</View>
    </Animated.View>
  );
}
