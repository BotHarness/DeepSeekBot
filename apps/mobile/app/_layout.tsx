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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="dm/[slug]" options={{ title: '' }} />
        <Stack.Screen name="pair" options={{ title: t.pairTitle, presentation: 'modal' }} />
        <Stack.Screen name="inbox/[id]" options={{ title: t.inbox }} />
        <Stack.Screen
          name="full-client"
          options={{
            title: t.fullClient,
            presentation: 'fullScreenModal',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
