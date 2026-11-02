import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from './text';

export function SheetPage({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: theme.overlay.fill, paddingBottom: insets.bottom }}>
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
    </View>
  );
}
