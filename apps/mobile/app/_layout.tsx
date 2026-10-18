import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { usePushRouting } from '../src/host/push-routing';
import { HostDrawer, WorkspaceButton } from '../src/ui/shell/host-drawer';
import { StatisticsNotice } from '../src/ui/shell/statistics-notice';
import { KeyboardRoot } from '../src/ui/primitives/keyboard-frame';
import { AppDialogHost } from '../src/ui/primitives/app-dialog-host';
import { sheetScreenOptions } from '../src/ui/primitives/sheet-screen';
import { useDesignTheme } from '../src/ui/design/theme';
import { t } from '../src/ui/strings';
import { useTheme } from '../src/ui/theme';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
  const theme = useTheme();
  const design = useDesignTheme();
  const routing = usePushRouting();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardRoot>
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
              <Stack.Screen name="channel/[id]" options={{ title: '' }} />
              <Stack.Screen
                name="bot/[slug]"
                options={{
                  title: t.profile,
                  ...sheetScreenOptions(design, Platform.OS === 'android'),
                }}
              />
              <Stack.Screen
                name="group/[id]"
                options={{
                  title: t.groupInfo,
                  ...sheetScreenOptions(design, Platform.OS === 'android'),
                }}
              />
              <Stack.Screen
                name="settings"
                options={{
                  title: t.settings,
                  ...sheetScreenOptions(design, true),
                }}
              />
              <Stack.Screen name="pair" options={{ title: t.pairTitle, presentation: 'modal' }} />
              <Stack.Screen name="inbox/[id]" options={{ title: t.inbox }} />
              <Stack.Screen
                name="cloud-join"
                options={{ title: t.cloudJoin.title, headerRight: () => <WorkspaceButton /> }}
              />
              <Stack.Screen
                name="cloud-services"
                options={{ title: t.cloud.title, headerRight: () => <WorkspaceButton /> }}
              />
              <Stack.Screen
                name="cloud-organizations"
                options={{
                  title: t.cloudOrganizations.title,
                  headerRight: () => <WorkspaceButton />,
                }}
              />
              <Stack.Screen
                name="cloud-invitations"
                options={{
                  title: t.cloudInvitations.title,
                  headerRight: () => <WorkspaceButton />,
                }}
              />
              <Stack.Screen
                name="cloud-agents"
                options={{ title: t.cloudAgents.title, headerRight: () => <WorkspaceButton /> }}
              />
              <Stack.Screen
                name="cloud-channels"
                options={{ title: t.cloudChannels.title, headerRight: () => <WorkspaceButton /> }}
              />
              <Stack.Screen name="notifications" options={{ title: t.notifications }} />
              <Stack.Screen
                name="browser/[slug]"
                options={{
                  title: t.profileBrowser,
                  presentation: 'fullScreenModal',
                  headerShown: false,
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen
                name="computer/[slug]"
                options={{
                  title: t.profileComputer,
                  presentation: 'fullScreenModal',
                  headerShown: false,
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen
                name="host-look"
                options={{
                  title: t.hostLook,
                  ...sheetScreenOptions(design, true),
                }}
              />
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
            <StatisticsNotice />
            <HostDrawer />
            <AppDialogHost />
          </View>
        </SafeAreaProvider>
      </KeyboardRoot>
    </GestureHandlerRootView>
  );
}
