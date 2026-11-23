import { ChatsSheetRoot } from './chats-sheet-root';
import { WorkspacePager } from './workspace-pager';
import { ActivitySheetRoot } from './activity-sheet-root';
import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import { useState, type ComponentProps } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHostSession } from '../../host/host-session';
import { useConversationFilter } from '../../host/native-conversation-filter';
import { useActivityCount } from '../../host/native-activity-count';
import { useQuickActionRouting } from './quick-action-routing';
import { useProfileSetupPrompt } from '../../host/profile-setup-prompt';
import { useDesignTheme } from '../design/theme';
import { fab, materialNavigationBar, navigationBar, radius, space } from '../design/tokens';
import { NavigationMaterial } from './navigation-material';
import { NavigationDestinations } from './navigation-destinations';
import { ChatsCreate } from './chats-create';
import { androidTabCreateAction, openNewSession } from './page-create-actions';
import { SessionCreateFab } from './session-create-fab';
import { FloatingTabInset } from './floating-tab-inset';
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
  const { fontScale } = useWindowDimensions();
  const [nativeHeight, setNativeHeight] = useState<number>();
  const android = Platform.OS === 'android';
  const size = android
    ? (nativeHeight ??
      Math.max(
        materialNavigationBar.height + insets.bottom,
        materialNavigationBar.indicatorHeight +
          materialNavigationBar.iconLabelGap +
          theme.type.meta.line * fontScale +
          space.x4,
      ))
    : Math.max(
        navigationBar.height,
        theme.type.title.line +
          theme.type.meta.line * fontScale * (fontScale > 1.3 ? 2 : 1) +
          space.x5,
      );
  const bottom = android ? 0 : Math.max(insets.bottom, space.x4);
  const reserved = size + bottom + space.x5;
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
  scope,
}: NavigationBarLayout & { scope: string }) {
  const t = useStrings();
  const currentKey = state.routes[state.index]?.key;
  const selectTab = useSelectionFeedback(currentKey, (key) => {
    if (key !== undefined) return navigateToTab(key);
  });
  const theme = useDesignTheme();
  const pending = useActivityCount().count ?? 0;
  const insets = useSafeAreaInsets();
  const { saved, client } = useHostSession();
  const create = androidTabCreateAction(
    state.routes[state.index]?.name,
    sessionsTab,
    client ? saved : undefined,
  );
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
  if (Platform.OS === 'android')
    return (
      <>
        <View
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
          <NavigationDestinations items={items} />
        </View>
        {create ? (
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
            {create === 'chats' ? (
              <ChatsCreate scope={scope} size={fab.size} />
            ) : (
              <SessionCreateFab onPress={openNewSession} />
            )}
          </View>
        ) : null}
      </>
    );
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: insets.left + space.x5,
        right: insets.right + space.x5,
        bottom,
        height: size,
        flexDirection: 'row',
        padding: space.x2,
        borderRadius: radius.round,
      }}
    >
      <NavigationMaterial />
      <NavigationDestinations items={items} />
    </View>
  );
}
