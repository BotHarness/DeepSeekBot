import { View, type ViewInstance } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useDesignTheme } from '../design/theme';
import { radius, space, tabChrome } from '../design/tokens';
import { useMounted } from '../mounted';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { Text } from '../primitives/text';

export type TabSlots = { left: number; width: number; gap: number; count: number };

export function tabSlotCenter({ left, width, gap, count }: TabSlots, index: number): number {
  const slot = (width - gap * (count - 1)) / count;
  return left + index * (slot + gap) + slot / 2;
}

export function TabNamePill({
  label,
  center,
  screenWidth,
  bottom,
}: {
  label: string;
  center: number;
  screenWidth: number;
  bottom: number;
}) {
  const theme = useDesignTheme();
  const reduced = useSystemReducedMotion();
  const opacity = useSharedValue(0);
  const mount = useMounted<ViewInstance>(() => {
    if (reduced) {
      opacity.value = 1;
      opacity.value = withDelay(
        tabChrome.pillHold,
        withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never }),
        ReduceMotion.Never,
      );
      return;
    }
    opacity.value = withSequence(
      withTiming(1, { duration: tabChrome.pillFade }),
      withDelay(tabChrome.pillHold, withTiming(0, { duration: tabChrome.pillFade })),
    );
  }, [opacity, reduced]);
  const shown = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const half = Math.max(0, Math.min(center, screenWidth - center) - space.x2);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: center - half,
        width: half * 2,
        bottom,
        alignItems: 'center',
      }}
    >
      <Animated.View
        ref={mount}
        testID="tab-name-pill"
        style={[
          {
            paddingHorizontal: space.x3,
            paddingVertical: space.x1,
            borderRadius: radius.round,
            backgroundColor: theme.color.fg,
          },
          shown,
        ]}
      >
        <Text variant="meta" strong numberOfLines={1} style={{ color: theme.color.base }}>
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}
