import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { swipeEntryListeners, swipeEntryOptions } from './swipe-entry';

export function TabStack({
  background,
  children,
}: {
  background?: ColorValue;
  children?: ReactNode;
} = {}) {
  const theme = useDesignTheme();
  const fill = background ?? theme.color.base;
  return (
    <Stack
      screenOptions={({ route }) => ({
        headerLargeTitleEnabled: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: fill },
        headerLargeStyle: { backgroundColor: fill },
        headerTintColor: theme.color.fg,
        contentStyle: { backgroundColor: fill },
        ...swipeEntryOptions(route),
      })}
      screenListeners={swipeEntryListeners('default')}
    >
      {children}
    </Stack>
  );
}
