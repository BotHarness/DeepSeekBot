import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { materialSearchHeight } from '../design/material-search';
import { useDesignTheme } from '../design/theme';
import { space, tabHeader } from '../design/tokens';
import { Text } from '../primitives/text';
import { SettingsScrollContext, type SettingsScroll } from '../primitives/settings-scroll';
import { useStrings } from '../strings';
import { CollapsingToolbar, useChromeProgress } from './scroll-chrome';

export function SettingsTabPage({
  onScroll,
  children,
}: {
  onScroll: SettingsScroll;
  children: ReactNode;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const minimum = insets.top + space.x2 * 2 + materialSearchHeight(theme.fontScale);
  const [measured, setMeasured] = useState(0);
  const height = Math.max(minimum, measured);
  const travel = Math.max(0, height - insets.top);
  const progress = useChromeProgress();
  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -travel * progress.get() }],
  }));
  const fill = theme.overlay.fill;
  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: fill }}>
      <Stack.Screen options={{ headerShown: false, title: t.settings }} />
      <Animated.View style={[{ flex: 1, marginTop: height, marginBottom: -travel }, pageStyle]}>
        <SettingsScrollContext.Provider
          value={{ onScroll, travel, ScrollView: Animated.ScrollView }}
        >
          {children}
        </SettingsScrollContext.Provider>
      </Animated.View>
      <CollapsingToolbar travel={travel} height={height}>
        <View
          testID="settings-header"
          onLayout={(event) => setMeasured(event.nativeEvent.layout.height)}
          style={{
            minHeight: minimum,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: tabHeader.gutter,
            paddingTop: insets.top + space.x2,
            paddingBottom: space.x2,
            backgroundColor: fill,
          }}
        >
          <Text variant="title" strong accessibilityRole="header" numberOfLines={1}>
            {t.settings}
          </Text>
        </View>
      </CollapsingToolbar>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top,
          backgroundColor: fill,
        }}
      />
    </View>
  );
}
