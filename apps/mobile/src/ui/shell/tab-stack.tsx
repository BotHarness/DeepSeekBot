import { Stack } from 'expo-router';

import { useDesignTheme } from '../design/theme';
import { swipeEntryListeners, swipeEntryOptions } from './swipe-entry';

export function TabStack() {
  const theme = useDesignTheme();
  return (
    <Stack
      screenOptions={({ route }) => ({
        headerLargeTitleEnabled: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: theme.color.base },
        headerTintColor: theme.color.fg,
        contentStyle: { backgroundColor: theme.color.base },
        ...swipeEntryOptions(route),
      })}
      screenListeners={swipeEntryListeners('default')}
    />
  );
}
