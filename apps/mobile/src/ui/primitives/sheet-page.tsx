import { Stack } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from './text';

export function SheetPage({
  title,
  subtitle,
  children,
  safeAreaFooter,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  safeAreaFooter?: ReactElement | undefined;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.overlay.fill,
        paddingBottom: safeAreaFooter === undefined ? insets.bottom : 0,
      }}
    >
      {title === undefined ? null : <Stack.Screen options={{ title }} />}
      {subtitle === undefined ? null : (
        <Text
          tone="muted"
          variant="meta"
          style={{ paddingHorizontal: space.x5, paddingVertical: space.x3 }}
        >
          {subtitle}
        </Text>
      )}
      {children}
      {safeAreaFooter}
    </View>
  );
}
