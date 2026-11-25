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
import { floatingToolbar, navigationBar, space } from '../design/tokens';
import { NavigationDestinations } from './navigation-destinations';
import {
  sessionDrawerProgress,
  useSessionDrawer,
} from '../../features/sessions/session-drawer-state';
import { landInSessionsTab } from '../../features/sessions/session-drawer-navigation';
import { usePinnedTab, type PinnedTab } from '../../features/pinned-tab/use-pinned-tab';
import { FloatingTabInset } from './floating-tab-inset';
import { TabChromeContext, useChromeHidden, useTabChrome } from './tab-chrome';
import { TabNamePill, tabSlotCenter, type TabSlots } from './tab-name-pill';
import { tabTransition } from './tab-transition';
import { navigationAccessibilityLabel, navigationLabel } from './navigation-label';
import { openTabMenu } from './tab-menu-sheet';
import { useTabMenus, type TabMenuRoute } from './use-tab-menus';
import { useSystemReducedMotion } from '../primitives/use-system-reduced-motion';
import { useTabOrder } from '../interface-preferences';
import { useStrings } from '../strings';
import { useSelectionFeedback } from '../selection-feedback';
import type { NavigationDestination } from './navigation-destination';
import { sessionsStack } from './sessions-stack';
import { tabRoute, tabSlotOf, type TabSlot } from './tab-slots';

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
  const order = useTabOrder();
  const pinned = usePinnedTab();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const reduced = useSystemReducedMotion();
  const [nativeHeight, setNativeHeight] = useState<number>();
  const android = Platform.OS === 'android';
  const size = android
    ? (nativeHeight ?? floatingToolbar.height + floatingToolbar.inset * 2)
    : navigationBar.height;
  const bottom = android
    ? insets.bottom + floatingToolbar.offset - floatingToolbar.inset
    : Math.max(insets.bottom, space.x4);
  const reserved = size + bottom + space.x5;
  const hidden = useSharedValue(0);
  const chrome = useMemo(() => ({ hidden, islandTop: size + bottom }), [hidden, size, bottom]);
  const quickActions = useQuickActionRouting();
  const profileSetup = useProfileSetupPrompt();
  const titles: Record<TabSlot, string> = {
    chats: t.chats,
    pinned: pinned?.name ?? t.pinnedTab.title,
    activity: t.activity,
    sessions: t.hostSessions.title,
    settings: t.settings,
  };
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
                  pinned={pinned}
                />
              )}
              screenOptions={{
                headerShown: false,
                sceneStyle: { backgroundColor: theme.color.base },
                ...tabTransition(android ? 'android' : 'ios', reduced),
              }}
            >
              {order.map((slot) => (
                <Tabs.Screen key={slot} name={tabRoute(slot)} options={{ title: titles[slot] }} />
              ))}
            </Tabs>
          </View>
        </WorkspacePager>
      </TabChromeContext>
    </FloatingTabInset.Provider>
  );
}

type NavigationBarLayout = TabBarProps & {
  size: number;
  bottom: number;
  pinned: PinnedTab | undefined;
  onNativeHeight(height: number): void;
};

function NavigationBar({
  state,
  emitter,
  navigateToTab,
  size,
  bottom,
  pinned,
  onNativeHeight,
}: NavigationBarLayout) {
  const t = useStrings();
  const currentKey = state.routes[state.index]?.key;
  const selectTab = useSelectionFeedback(currentKey, (key) => {
    if (key !== undefined) return navigateToTab(key);
  });
  const theme = useDesignTheme();
  const pending = useActivityCount().count ?? 0;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const chrome = useTabChrome();
  const hiddenNow = useChromeHidden(chrome?.hidden);
  const drawerOpen = useSessionDrawer().open;
  const [pill, setPill] = useState<{ index: number; label: string; seq: number }>();
  const routes = state.routes.filter((route) => tabSlotOf(route.name) !== undefined);
  const { menus, load: loadMenus } = useTabMenus({
    focusedRoute: state.routes[state.index]?.name,
    go: (name) => {
      const key = state.routes.find((route) => route.name === name)?.key;
      if (key !== undefined && key !== currentKey) navigateToTab(key);
    },
  });
  const android = Platform.OS === 'android';
  const toolbarWidth =
    floatingToolbar.item * routes.length + floatingToolbar.gap * Math.max(0, routes.length - 1);
  const slots: TabSlots = android
    ? {
        left: (width - toolbarWidth) / 2,
        width: toolbarWidth,
        gap: floatingToolbar.gap,
        count: routes.length,
      }
    : {
        left: insets.left + space.x5,
        width: width - insets.left - insets.right - space.x5 * 2,
        gap: space.x2,
        count: routes.length,
      };
  const items: NavigationDestination[] = routes.map((route, index) => {
    const slot = tabSlotOf(route.name) ?? 'chats';
    const focused = route.key === currentKey;
    const count = slot === 'activity' ? pending : slot === 'pinned' ? (pinned?.count ?? 0) : 0;
    const name = navigationLabel(t, slot, pinned?.name);
    const flash = () =>
      setPill((previous) => ({ index, label: name, seq: (previous?.seq ?? 0) + 1 }));
    const menu = menus[route.name as TabMenuRoute];
    return {
      key: route.key,
      slot,
      focused,
      count,
      name,
      accessibilityLabel: navigationAccessibilityLabel(t, slot, count, pinned?.countedLabel),
      conversation: slot === 'pinned' ? pinned?.conversation : undefined,
      menu,
      onPress: () => {
        flash();
        const event = emitter.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (event.defaultPrevented) return;
        selectTab(route.key);
        if (slot === 'sessions') landInSessionsTab(focused, sessionsStack(route));
      },
      onLongPress: () => {
        if (menu === undefined) flash();
        else
          openTabMenu(name, menu, {
            pageX: tabSlotCenter(slots, index),
            pageY: height - bottom - size,
          });
      },
    };
  });
  const band = size + bottom;
  const pillBottom = android
    ? bottom + size - floatingToolbar.inset + space.x2
    : bottom + size / 2 + navigationBar.symbolBox / 2 + space.x1;
  const slide = useAnimatedStyle(() => ({
    opacity: 1 - sessionDrawerProgress.value,
    transform: [{ translateY: (chrome?.hidden.value ?? 0) * band }],
  }));
  return (
    <Animated.View
      pointerEvents={hiddenNow || drawerOpen ? 'none' : 'box-none'}
      style={[
        android
          ? {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingBottom: bottom,
              alignItems: 'center',
              backgroundColor: theme.color.base,
            }
          : {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: band,
              paddingBottom: bottom,
              paddingLeft: slots.left,
              paddingRight: insets.right + space.x5,
              flexDirection: 'row',
              backgroundColor: theme.color.base,
            },
        slide,
      ]}
    >
      <View ref={loadMenus} collapsable={false} />
      <View
        collapsable={false}
        style={android ? undefined : { flex: 1, flexDirection: 'row' }}
        onLayout={
          android ? ({ nativeEvent }) => onNativeHeight(nativeEvent.layout.height) : undefined
        }
      >
        <NavigationDestinations items={items} />
      </View>
      {pill ? (
        <TabNamePill
          key={pill.seq}
          label={pill.label}
          center={tabSlotCenter(slots, pill.index)}
          screenWidth={width}
          bottom={pillBottom}
        />
      ) : null}
    </Animated.View>
  );
}
