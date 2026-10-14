import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { t } from '../src/ui/strings';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const theme = useTheme();
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.ink,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: t.roster, headerLargeTitle: true }} />
        <Stack.Screen name="connect" options={{ title: t.connectTitle, presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
