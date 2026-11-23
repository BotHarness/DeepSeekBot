import { useMemberCanCreateBots } from '../../host/member-permissions';
import { ChatsSheetRoot } from './chats-sheet-root';
import { WorkspacePager } from './workspace-pager';
import { ActivitySheetRoot } from './activity-sheet-root';
import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { useRef, useState, type ComponentProps } from 'react';
import { Platform, View, useWindowDimensions, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHostSession } from '../../host/host-session';
import { useConversationFilter } from '../../host/native-conversation-filter';
import { useHostLook } from '../../host/native-host-look';
import { useActivityCount } from '../../host/native-activity-count';
import { useQuickActionRouting } from './quick-action-routing';
import { useProfileSetupPrompt } from '../../host/profile-setup-prompt';
import {
  creationTargets,
  type CreationAction,
  type CreationTarget,
} from '../../host/creation-targets';
import { cloudClient } from '../../cloud/native';
import { useCloudConversations } from '../../cloud/native-conversations';
import { cloudError } from '../../cloud/client';
import { prepareCloudCreation } from '../../cloud/prepare-creation';
import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import { useDesignTheme } from '../design/theme';
import { fab, materialNavigationBar, navigationBar, radius, space } from '../design/tokens';
import { useMounted } from '../mounted';
import { NavigationMaterial } from './navigation-material';
import { NavigationDestinations } from './navigation-destinations';
import { creationMenuItems } from './creation-menu-items';
import { CreationMenuButton } from './creation-menu-button';
import { showAppDialog } from '../primitives/app-dialog';
import { FloatingTabInset } from './floating-tab-inset';
import { iosTabIslandHeight, tabIslandLayout } from './tab-island-layout';
import { useSessionsTab } from '../interface-preferences';
import { useStrings } from '../strings';
import { useSelectionFeedback } from '../selection-feedback';
import type { NavigationDestination } from './navigation-destination';

type TabBarProps = ComponentProps<typeof BottomTabBar>;

export function BottomNavigation() {
  return (
    <ActivitySheetRoot>
      <ChatsSheetRoot>
        <NavigationLayout />
      </ChatsSheetRoot>
    </ActivitySheetRoot>
  );
}

function NavigationLayout() {
  const t = useStrings();
  const sessionsTab = useSessionsTab();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { fontScale, width } = useWindowDimensions();
  const [nativeHeight, setNativeHeight] = useState<number>();
  const android = Platform.OS === 'android';
  const island = tabIslandLayout({
    os: android ? 'android' : 'ios',
    labels: [t.chats, t.activity, ...(sessionsTab ? [t.hostSessions.title] : []), t.settings],
    width: android ? width : width - insets.left - insets.right,
    fontScale,
  });
  const size = android
    ? (nativeHeight ??
      Math.max(
        materialNavigationBar.height + insets.bottom,
        materialNavigationBar.indicatorHeight +
          materialNavigationBar.iconLabelGap +
          theme.type.meta.line * fontScale +
          space.x4,
      ))
    : iosTabIslandHeight(island);
  const bottom = android ? 0 : Math.max(insets.bottom, space.x4);
  const separateCreation = island.separateCreation;
  const reserved =
    size + bottom + space.x5 + (separateCreation ? navigationBar.height + space.x3 : 0);
  const quickActions = useQuickActionRouting();
  const profileSetup = useProfileSetupPrompt();
  return (
    <FloatingTabInset.Provider value={reserved}>
      <View ref={profileSetup.load} collapsable={false} />
      <View ref={profileSetup.prompt} collapsable={false} />
      <WorkspacePager>
        <View ref={quickActions} collapsable={false} style={{ flex: 1 }}>
          <Tabs
            safeAreaInsets={{ bottom: 0 }}
            tabBar={(props) => (
              <NavigationBar
                {...props}
                size={size}
                bottom={bottom}
                onNativeHeight={setNativeHeight}
                sessionsTab={sessionsTab}
                separateCreation={separateCreation}
                labels={island.labels}
              />
            )}
            screenOptions={{
              headerShown: false,
              sceneStyle: { backgroundColor: theme.color.base },
            }}
          >
            <Tabs.Screen name="(home)" options={{ title: t.chats }} />
            <Tabs.Screen name="(activity)" options={{ title: t.activity }} />
            <Tabs.Screen
              name="(sessions)"
              options={sessionsTab ? { title: t.hostSessions.title } : { href: null }}
            />
            <Tabs.Screen name="(settings)" options={{ title: t.settings }} />
          </Tabs>
        </View>
      </WorkspacePager>
    </FloatingTabInset.Provider>
  );
}

type NavigationBarLayout = TabBarProps & {
  sessionsTab: boolean;
  separateCreation: boolean;
  labels: boolean;
  size: number;
  bottom: number;
  onNativeHeight(height: number): void;
};

function NavigationBar(props: NavigationBarLayout) {
  const [scope] = useConversationFilter();
  return <ScopedNavigationBar key={scope} {...props} scope={scope} />;
}

function ScopedNavigationBar({
  state,
  emitter,
  navigateToTab,
  size,
  bottom,
  onNativeHeight,
  sessionsTab,
  separateCreation,
  labels,
  scope,
}: NavigationBarLayout & { scope: string }) {
  const t = useStrings();
  const currentKey = state.routes[state.index]?.key;
  const selectTab = useSelectionFeedback(currentKey, (key) => {
    if (key !== undefined) return navigateToTab(key);
  });
  const { saved } = useHostSession();
  const look = useHostLook(saved?.hostId);
  const directory = useCloudConversations();
  const canCreateBots = useMemberCanCreateBots(
    saved?.member === undefined ? undefined : saved.hostId,
  );
  const targets = creationTargets(
    saved ? { hostId: saved.hostId, name: shownHostName(look, saved.hostName) } : undefined,
    directory.workspaces,
  ).map((target) =>
    target.kind === 'computer'
      ? { ...target, channelCreation: Platform.OS === 'android', botCreation: canCreateBots }
      : target,
  );
  const theme = useDesignTheme();
  const pending = useActivityCount().count ?? 0;
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const pendingCreation = useRef(false);
  const generation = useRef(0);
  const mount = useMounted<ViewInstance>(() => {
    return () => {
      generation.current++;
    };
  }, [currentKey]);
  const choose = async (action: CreationAction, target?: CreationTarget) => {
    if (pendingCreation.current) return;
    const version = generation.current;
    if (action === 'join') {
      router.push('/cloud-join');
      return;
    }
    if (action === 'bot' || action === 'zip' || action === 'marketplace' || action === 'git') {
      router.push({
        pathname:
          action === 'marketplace'
            ? '/marketplace'
            : action === 'zip'
              ? '/import-bot-zip'
              : action === 'git'
                ? '/import-bot-git'
                : '/create-bot',
        params:
          target?.kind === 'computer' ? { entry: 'host', hostId: target.hostId } : { entry: 'all' },
      });
      return;
    }
    if (action === 'channel' && target?.kind !== 'cloud' && Platform.OS === 'android') {
      router.push({
        pathname: '/create-channel',
        params:
          scope === 'all' || !target ? { entry: 'all' } : { entry: 'host', hostId: target.hostId },
      });
      return;
    }
    if (!target) return;
    pendingCreation.current = true;
    setBusy(true);
    try {
      if (target.kind === 'cloud') {
        await prepareCloudCreation(cloudClient, target.workspace);
        if (version !== generation.current) return;
        router.push({
          pathname: action === 'invite' ? '/cloud-invitations' : '/cloud-create-channel',
          params: {
            instanceId: target.workspace.instanceId,
            organizationId: target.workspace.organizationId,
            accountScope: target.workspace.scope,
          },
        });
      }
    } catch (e) {
      if (version === generation.current)
        showAppDialog(t.createHere, cloudError(e), [{ text: t.close, style: 'cancel' }]);
    } finally {
      pendingCreation.current = false;
      setBusy(false);
    }
  };
  const items: NavigationDestination[] = state.routes
    .filter((route) => sessionsTab || route.name !== '(sessions)')
    .map((route) => ({
      key: route.key,
      focused: route.key === currentKey,
      activity: route.name === '(activity)',
      settings: route.name === '(settings)',
      sessions: route.name === '(sessions)',
      count: route.name === '(activity)' ? pending : 0,
      onPress: () => {
        const event = emitter.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (!event.defaultPrevented) selectTab(route.key);
      },
      onLongPress: () => emitter.emit({ type: 'tabLongPress', target: route.key }),
    }));
  const fabBottom = size + bottom + fab.margin;
  const creatable =
    creationMenuItems({ scope, targets, nativeChannelForm: Platform.OS === 'android' }).length > 0;
  const create = (buttonSize: number) =>
    creatable ? (
      <CreationMenuButton
        scope={scope}
        targets={targets}
        size={buttonSize}
        busy={busy}
        onPick={(action, target) => void choose(action, target)}
      />
    ) : null;
  if (Platform.OS === 'android')
    return (
      <>
        <View
          ref={mount}
          onLayout={({ nativeEvent }) => onNativeHeight(nativeEvent.layout.height)}
          pointerEvents="box-none"
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom,
              backgroundColor: theme.layer.raised.fill,
            },
          ]}
        >
          <NavigationDestinations items={items} labels={labels} />
        </View>
        {state.routes[state.index]?.name === '(home)' ? (
          <View
            pointerEvents="box-none"
            style={[
              {
                position: 'absolute',
                right: insets.right + fab.margin,
                bottom: fabBottom,
              },
            ]}
          >
            {create(fab.size)}
          </View>
        ) : null}
      </>
    );
  return (
    <>
      <View
        ref={mount}
        pointerEvents="box-none"
        style={[
          {
            position: 'absolute',
            left: insets.left + space.x5,
            right: insets.right + space.x5,
            bottom,
            flexDirection: separateCreation ? 'column' : 'row',
            alignItems: separateCreation ? 'stretch' : 'flex-end',
            gap: space.x3,
          },
        ]}
      >
        {separateCreation && creatable ? (
          <View style={{ alignSelf: 'flex-end' }}>{create(navigationBar.height)}</View>
        ) : null}
        <View
          style={{
            flex: separateCreation ? undefined : 1,
            height: size,
            flexDirection: 'row',
            padding: space.x2,
            borderRadius: radius.round,
          }}
        >
          <NavigationMaterial />
          <NavigationDestinations items={items} labels={labels} />
        </View>
        {separateCreation ? null : create(navigationBar.height)}
      </View>
    </>
  );
}
