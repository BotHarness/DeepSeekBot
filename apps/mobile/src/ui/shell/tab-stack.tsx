import { Stack } from 'expo-router';

import { useDesignTheme } from '../design/theme';

export function TabStack() {
  const theme = useDesignTheme();
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: theme.color.base },
        headerTintColor: theme.color.fg,
        contentStyle: { backgroundColor: theme.color.base },
      }}
    />
  );
}
