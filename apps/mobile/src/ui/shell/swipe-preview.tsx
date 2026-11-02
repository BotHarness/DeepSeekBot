import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useDesignTheme } from '../design/theme';
import { swipeOpen } from '../design/tokens';

export function SwipePreview({
  travel,
  color,
  children,
}: {
  travel: SharedValue<number>;
  color: string;
  children?: ReactNode;
}) {
  const theme = useDesignTheme();
  const { width } = useWindowDimensions();
  const dim = useAnimatedStyle(() => ({
    opacity: width > 0 ? (travel.value / width) * swipeOpen.dim : 0,
  }));
  const panel = useAnimatedStyle(() => ({
    opacity: travel.value > 0 ? 1 : 0,
    transform: [{ translateX: width - travel.value }],
  }));
  return (
    <View
      testID="swipe-preview"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }, dim]} />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: color,
            boxShadow: swipeOpen.edgeShadow[theme.scheme],
          },
          panel,
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}
