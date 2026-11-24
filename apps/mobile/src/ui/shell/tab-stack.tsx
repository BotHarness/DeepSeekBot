import { Stack } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import type { ColorValue } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { swipeEntryListeners, swipeEntryOptions } from './swipe-entry';

export const sessionRouteOptions = {
  headerLargeTitleEnabled: false,
  headerBackButtonDisplayMode: 'minimal',
} as const;

export function TabStack({
  background,
  router,
  children,
}: {
  background?: ColorValue;
  router?: ComponentProps<typeof Stack>['UNSTABLE_router'];
  children?: ReactNode;
} = {}) {
  const theme = useDesignTheme();
  const fill = background ?? theme.color.base;
  return (
    <Stack
      {...(router === undefined ? {} : { UNSTABLE_router: router })}
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
