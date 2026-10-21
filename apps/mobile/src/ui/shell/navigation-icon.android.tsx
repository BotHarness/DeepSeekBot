import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';

import { useDesignTheme } from '../design/theme';
import { materialNavigationBar, motion, radius, tabMotion } from '../design/tokens';
import { badgeCount } from '../primitives/badge-count';
import { Text } from '../primitives/text';

export function NavigationIcon({
  children,
  focused,
  color,
  count = 0,
  countVisible = false,
}: {
  children: ReactNode;
  focused: boolean;
  color: ColorValue;
  count?: number;
  countVisible?: boolean;
}) {
  const theme = useDesignTheme();
  const progress = useDerivedValue(() =>
    withTiming(countVisible && count > 0 ? 1 : 0, { duration: motion.menu }),
  );
  const iconStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: 1 - (1 - tabMotion.inactiveIconScale) * progress.value }],
  }));
  const countStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: tabMotion.inactiveIconScale + (1 - tabMotion.inactiveIconScale) * progress.value },
    ],
  }));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
      }}
    >
      <Animated.View
        style={[
          {
            width: materialNavigationBar.indicatorWidth,
            height: materialNavigationBar.indicatorHeight,
            borderRadius: radius.round,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: focused ? theme.layer.raised.chosen : undefined,
          },
          iconStyle,
        ]}
      >
        {children}
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            alignItems: 'center',
            justifyContent: 'center',
          },
          countStyle,
        ]}
      >
        <Text variant="title" strong style={{ color, fontVariant: ['tabular-nums'] }}>
          {badgeCount(count)}
        </Text>
      </Animated.View>
    </View>
  );
}
