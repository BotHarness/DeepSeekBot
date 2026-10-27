import { useMounted } from '../src/ui/mounted';
import { watchRequestActivity } from '../src/host/native-live-activity';
import { useCallback, useState } from 'react';
import { Notice } from '../src/ui/request-parts';
import { channelRouteId, channelStackRouter } from '../src/ui/shell/channel-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, type ViewInstance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import '../src/host/native-haptic-feedback';

import { usePushRouting } from '../src/host/push-routing';
import { HostDrawer, WorkspaceButton, hostDrawer } from '../src/ui/shell/host-drawer';
import { useWorkspaceNavigation } from '../src/ui/shell/native-workspace-navigation';
import { StatisticsNotice } from '../src/ui/shell/statistics-notice';
import { BotCreationNotice } from '../src/ui/shell/bot-creation-notice';
import { ChannelCreationNotice } from '../src/ui/shell/channel-creation-notice';
import { cloudChannelRouteId } from '../src/ui/shell/cloud-channel-navigation';
import { KeyboardRoot } from '../src/ui/primitives/keyboard-frame';
import { AppDialogHost } from '../src/ui/primitives/app-dialog-host';
import { sheetScreenOptions } from '../src/ui/primitives/sheet-screen';
import { profileScreenOptions } from '../src/ui/chat/profile-presentation';
import { useReducedMotion } from 'react-native-reanimated';
import { HostAccentProvider } from '../src/ui/shell/host-accent-provider';
import { useDesignTheme } from '../src/ui/design/theme';
import { useStrings } from '../src/ui/strings';
import { useTheme } from '../src/ui/theme';
import { useNativeInterfacePreferences } from '../src/ui/native-interface-preferences';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
  const preferences = useNativeInterfacePreferences();
  if (!preferences.loaded) return null;
  return (
    <HostAccentProvider>
      <RootNavigator />
    </HostAccentProvider>
  );
}

function RootNavigator() {
  const t = useStrings();
  const theme = useTheme();
  const design = useDesignTheme();
  const reducedMotion = useReducedMotion();
  const [routingPending, setRoutingPending] = useState(false);
  const routing = usePushRouting(setRoutingPending, hostDrawer.captureWorkspaceSelection);
  const workspace = useWorkspaceNavigation(hostDrawer.beginWorkspaceSelection);
  const activity = useMounted(watchRequestActivity, []);
  const stack = useCallback(
    (node: ViewInstance | null) => {
      workspace(node);
      activity(node);
    },
    [workspace, activity],
  );
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardRoot>
        <SafeAreaProvider>
          <View ref={routing} style={{ flex: 1 }}>
            <StatusBar style={design.scheme === 'dark' ? 'light' : 'dark'} />
            {routingPending ? (
              <SafeAreaView edges={['top']}>
                <Notice tone="warning">{t.channelOpening}</Notice>
              </SafeAreaView>
            ) : null}
            <View ref={stack} testID="app-stack-content" style={{ flex: 1 }}>
              <Stack
                UNSTABLE_router={channelStackRouter}
                screenOptions={{
                  orientation: 'portrait',
                  headerStyle: { backgroundColor: theme.background },
                  headerTintColor: theme.ink,
                  headerShadowVisible: false,
                  headerBackButtonDisplayMode: 'minimal',
                  headerBackTitle: t.back,
                  contentStyle: { backgroundColor: theme.background },
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="dm/[slug]"
                  dangerouslySingular={channelRouteId}
                  options={{ title: '' }}
                />
                <Stack.Screen
                  name="channel/[id]"
                  dangerouslySingular={channelRouteId}
                  options={{ title: '' }}
                />
                <Stack.Screen
                  name="bot/[slug]"
                  options={{
                    title: t.profile,
                    ...profileScreenOptions(design, reducedMotion),
                  }}
                />
                <Stack.Screen
                  name="channel-details"
                  options={profileScreenOptions(design, reducedMotion)}
                />
                <Stack.Screen
                  name="group/[id]"
                  options={{
                    title: t.groupInfo,
                    ...profileScreenOptions(design, reducedMotion),
                  }}
                />
                <Stack.Screen
                  name="settings"
                  options={{
                    title: t.settings,
                    ...sheetScreenOptions(design, true),
                    ...(Platform.OS === 'ios' ? { presentation: 'modal' as const } : {}),
                  }}
                />
                <Stack.Screen
                  name="pair"
                  options={{
                    title: t.pairTitle,
                    ...sheetScreenOptions(design, true),
                    ...(Platform.OS === 'ios' ? { presentation: 'modal' as const } : {}),
                  }}
                />
                <Stack.Screen
                  name="share"
                  options={{
                    title: t.share.title,
                    ...sheetScreenOptions(design, true),
                  }}
                />
                <Stack.Screen
                  name="private-input"
                  options={{
                    ...sheetScreenOptions(design, true),
                    headerShown: true,
                    title: t.privateInputOpen,
                  }}
                />
                <Stack.Screen name="inbox/[id]" options={{ title: t.inbox }} />
                <Stack.Screen
                  name="conversation-section"
                  options={{
                    ...sheetScreenOptions(design, true),
                    title: t.rowActions.section,
                    headerShown: Platform.OS !== 'android',
                  }}
                />
                <Stack.Screen
                  name="cloud-join"
                  options={{
                    title: t.cloudJoin.title,
                    headerRight: () => <WorkspaceButton />,
                  }}
                />
                <Stack.Screen
                  name="cloud-services"
                  options={{
                    title: t.cloud.title,
                    headerRight: () => <WorkspaceButton />,
                  }}
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
                  options={{
                    title: t.cloudAgents.title,
                    headerRight: () => <WorkspaceButton />,
                  }}
                />
                <Stack.Screen
                  name="cloud-channels"
                  dangerouslySingular={cloudChannelRouteId}
                  options={{
                    title: t.cloudChannels.title,
                    headerRight: () => <WorkspaceButton />,
                  }}
                />
                <Stack.Screen
                  name="message-feedback"
                  options={{ title: t.feedback.title, presentation: 'modal' }}
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
                    orientation: Platform.OS === 'android' ? 'all' : 'portrait',
                    presentation: Platform.OS === 'ios' ? 'card' : 'fullScreenModal',
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
                  name="host-connection"
                  options={{
                    title: t.connectionRoutes.title,
                    ...sheetScreenOptions(design, true),
                  }}
                />
              </Stack>
            </View>
            <BotCreationNotice />
            <ChannelCreationNotice />
            <StatisticsNotice />
            <HostDrawer />
            <AppDialogHost />
          </View>
        </SafeAreaProvider>
      </KeyboardRoot>
    </GestureHandlerRootView>
  );
}
