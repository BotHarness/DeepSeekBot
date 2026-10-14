import { Stack } from 'expo-router';

import { useDesignTheme } from '../../../src/ui/design/theme';

export default function BotProfileLayout() {
  const theme = useDesignTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.color.surface },
        headerTintColor: theme.color.fg,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.color.surface },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="memory" />
    </Stack>
  );
}
