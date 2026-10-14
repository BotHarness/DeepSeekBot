import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { usePushRouting } from '../src/host/push-routing';
import { t } from '../src/ui/strings';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const theme = useTheme();
  const routing = usePushRouting();
  return (
    <SafeAreaProvider>
      <View ref={routing} style={{ flex: 1 }}>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.ink,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            headerBackTitle: t.back,
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="dm/[slug]" options={{ title: '' }} />
          <Stack.Screen
            name="bot/[slug]"
            options={{
              title: t.profile,
              headerShown: false,
              presentation: 'formSheet',
              sheetAllowedDetents: [0.75, 1],
              sheetGrabberVisible: true,
            }}
          />
          <Stack.Screen name="pair" options={{ title: t.pairTitle, presentation: 'modal' }} />
          <Stack.Screen name="inbox/[id]" options={{ title: t.inbox }} />
          <Stack.Screen
            name="approval"
            options={{
              presentation: 'formSheet',
              headerShown: false,
              sheetAllowedDetents: [0.6, 1],
              sheetGrabberVisible: true,
            }}
          />
          <Stack.Screen name="notifications" options={{ title: t.notifications }} />
          <Stack.Screen name="hosts" options={{ title: t.computers, presentation: 'modal' }} />
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
      </View>
    </SafeAreaProvider>
  );
}
