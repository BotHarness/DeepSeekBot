import { ChatsSheetRoot } from './chats-sheet-root';
import { WorkspacePager } from './workspace-pager';
import { ActivitySheetRoot } from './activity-sheet-root';
import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import { useMemo, useState, type ComponentProps } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActivityCount } from '../../host/native-activity-count';
import { useQuickActionRouting } from './quick-action-routing';
import { useProfileSetupPrompt } from '../../host/profile-setup-prompt';
import { useDesignTheme } from '../design/theme';
import { materialNavigationBar, navigationBar, space } from '../design/tokens';
import { NavigationDestinations } from './navigation-destinations';
import { FloatingTabInset } from './floating-tab-inset';
import { TabChromeContext, useChromeHidden, useTabChrome } from './tab-chrome';
import { TabNamePill, tabSlotCenter } from './tab-name-pill';
import { tabTransition } from './tab-transition';
import { navigationLabel } from './navigation-label';
import { useTabMenus, type TabMenuRoute } from './use-tab-menus';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
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
  const reduced = useSystemReducedMotion();
  const [nativeHeight, setNativeHeight] = useState<number>();
  const android = Platform.OS === 'android';
  const size = android
    ? (nativeHeight ?? materialNavigationBar.height + insets.bottom)
    : navigationBar.height;
  const bottom = android ? 0 : Math.max(insets.bottom, space.x4);
  const reserved = size + bottom + space.x5;
  const hidden = useSharedValue(0);
  const chrome = useMemo(() => ({ hidden, islandTop: size + bottom }), [hidden, size, bottom]);
  const quickActions = useQuickActionRouting();
  const profileSetup = useProfileSetupPrompt();
  return (
    <FloatingTabInset.Provider value={reserved}>
      <TabChromeContext value={chrome}>
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
                ...tabTransition(android ? 'android' : 'ios', reduced),
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
      </TabChromeContext>
    </FloatingTabInset.Provider>
  );
}

type NavigationBarLayout = TabBarProps & {
  sessionsTab: boolean;
  size: number;
  bottom: number;
  onNativeHeight(height: number): void;
};

function NavigationBar({
  state,
  emitter,
  navigateToTab,
  size,
  bottom,
  onNativeHeight,
  sessionsTab,
}: NavigationBarLayout) {
  const t = useStrings();
  const currentKey = state.routes[state.index]?.key;
  const selectTab = useSelectionFeedback(currentKey, (key) => {
    if (key !== undefined) return navigateToTab(key);
  });
  const theme = useDesignTheme();
  const pending = useActivityCount().count ?? 0;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const chrome = useTabChrome();
  const hiddenNow = useChromeHidden(chrome?.hidden);
  const [pill, setPill] = useState<{ index: number; label: string; seq: number }>();
  const routes = state.routes.filter((route) => sessionsTab || route.name !== '(sessions)');
  const { menus, load: loadMenus } = useTabMenus({
    sessionsTab,
    focusedRoute: state.routes[state.index]?.name,
    go: (name) => {
      const key = state.routes.find((route) => route.name === name)?.key;
      if (key !== undefined && key !== currentKey) navigateToTab(key);
    },
  });
  const items: NavigationDestination[] = routes.map((route, index) => {
    const item = {
      key: route.key,
      focused: route.key === currentKey,
      activity: route.name === '(activity)',
      settings: route.name === '(settings)',
      sessions: route.name === '(sessions)',
      count: route.name === '(activity)' ? pending : 0,
    };
    return {
      ...item,
      onPress: () => {
        setPill((previous) => ({
          index,
          label: navigationLabel(t, item),
          seq: (previous?.seq ?? 0) + 1,
        }));
        const event = emitter.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (!event.defaultPrevented) selectTab(route.key);
      },
      menu: menus[route.name as TabMenuRoute],
    };
  });
  const android = Platform.OS === 'android';
  const band = size + bottom;
  const slots = android
    ? { left: 0, width, gap: 0, count: items.length }
    : {
        left: insets.left + space.x5,
        width: width - insets.left - insets.right - space.x5 * 2,
        gap: space.x2,
        count: items.length,
      };
  const iconTop = android
    ? insets.bottom + (size - insets.bottom) / 2 + materialNavigationBar.iconSize / 2
    : bottom + size / 2 + navigationBar.symbolBox / 2;
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: (chrome?.hidden.value ?? 0) * band }],
  }));
  return (
    <Animated.View
      onLayout={
        android ? ({ nativeEvent }) => onNativeHeight(nativeEvent.layout.height) : undefined
      }
      pointerEvents={hiddenNow ? 'none' : 'box-none'}
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: android ? undefined : band,
          paddingBottom: android ? undefined : bottom,
          paddingLeft: android ? undefined : slots.left,
          paddingRight: android ? undefined : insets.right + space.x5,
          flexDirection: android ? undefined : 'row',
          backgroundColor: theme.color.base,
        },
        slide,
      ]}
    >
      <View ref={loadMenus} collapsable={false} />
      <NavigationDestinations items={items} />
      {pill ? (
        <TabNamePill
          key={pill.seq}
          label={pill.label}
          center={tabSlotCenter(slots, pill.index)}
          screenWidth={width}
          bottom={iconTop + space.x1}
        />
      ) : null}
    </Animated.View>
  );
}
