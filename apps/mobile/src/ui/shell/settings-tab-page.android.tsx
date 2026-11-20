import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { materialSearchHeight } from '../design/material-search';
import { useDesignTheme } from '../design/theme';
import { space, tabHeader } from '../design/tokens';
import { Text } from '../primitives/text';
import { SettingsScrollContext } from '../primitives/settings-scroll';
import { useStrings } from '../strings';
import { FixedToolbar } from './fixed-toolbar';

export function SettingsTabPage({ children }: { children: ReactNode }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const minimum = insets.top + space.x2 * 2 + materialSearchHeight(theme.fontScale);
  const [measured, setMeasured] = useState(0);
  const height = Math.max(minimum, measured);
  const fill = theme.overlay.fill;
  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: fill }}>
      <Stack.Screen options={{ headerShown: false, title: t.settings }} />
      <View style={{ flex: 1, marginTop: height }}>
        <SettingsScrollContext.Provider value={{ onScroll: undefined, headerInset: 0, ScrollView }}>
          {children}
        </SettingsScrollContext.Provider>
      </View>
      <FixedToolbar height={height}>
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
      </FixedToolbar>
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
