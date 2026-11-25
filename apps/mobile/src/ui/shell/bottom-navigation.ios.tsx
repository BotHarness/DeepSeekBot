import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAvatarIcons } from '../../features/pinned-tab/avatar-icon';
import { NativeTabMenus } from '../../features/pinned-tab/native-tab-menus';
import type { NativeTabMenuSpec } from '../../features/pinned-tab/native-tab-menus-model';
import { usePinnedTab } from '../../features/pinned-tab/use-pinned-tab';
import { landInSessionsTab } from '../../features/sessions/session-drawer-navigation';
import { useSessionDrawer } from '../../features/sessions/session-drawer-state';
import { useActivityCount } from '../../host/native-activity-count';
import { useProfileSetupPrompt } from '../../host/profile-setup-prompt';
import { useDesignTheme } from '../design/theme';
import { navigationBar, space } from '../design/tokens';
import { useTabOrder } from '../interface-preferences';
import { badgeCount } from '../primitives/badge-count';
import { useStrings } from '../strings';
import { ActivitySheetRoot } from './activity-sheet-root';
import { ChatsSheetRoot } from './chats-sheet-root';
import { FloatingTabInset } from './floating-tab-inset';
import { navigationLabel } from './navigation-label';
import { useQuickActionRouting } from './quick-action-routing';
import { sessionsStack } from './sessions-stack';
import { TabChromeContext, useChromeHidden } from './tab-chrome';
import type { TabMenuEntry } from './tab-menu-model';
import { tabRoute, type TabRoute } from './tab-slots';
import { menuSymbols, pinnedSymbols, tabSymbols } from './tab-symbols';
import { useTabMenus, type TabMenuRoute } from './use-tab-menus';
import { WorkspacePager } from './workspace-pager';

const tabHrefs: Record<TabMenuRoute, '/' | '/activity' | '/sessions'> = {
  '(home)': '/',
  '(activity)': '/activity',
  '(sessions)': '/sessions',
};

export function BottomNavigation() {
  return (
    <ActivitySheetRoot>
      <ChatsSheetRoot>
        <NativeNavigation />
      </ChatsSheetRoot>
    </ActivitySheetRoot>
  );
}

function NativeNavigation() {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const order = useTabOrder();
  const pinned = usePinnedTab();
  const pending = useActivityCount().count ?? 0;
  const hidden = useSharedValue(0);
  const hiddenNow = useChromeHidden(hidden);
  const drawerOpen = useSessionDrawer().open;
  const islandTop = navigationBar.height + Math.max(insets.bottom, space.x4);
  const chrome = useMemo(() => ({ hidden, islandTop }), [hidden, islandTop]);
  const quickActions = useQuickActionRouting();
  const profileSetup = useProfileSetupPrompt();
  const avatar = useAvatarIcons(pinned?.conversation);
  const [focusedRoute, setFocusedRoute] = useState<string>('(home)');
  const focusedNow = useRef(focusedRoute);
  focusedNow.current = focusedRoute;
  const { menus, load: loadMenus } = useTabMenus({
    focusedRoute,
    go: (name) => {
      if (focusedNow.current !== name) router.navigate(tabHrefs[name]);
    },
  });
  const specs: NativeTabMenuSpec[] = order.map((slot) => {
    const route = tabRoute(slot);
    const entries = menus[route as TabMenuRoute] ?? [];
    const item = (entry: TabMenuEntry) => ({
      id: entry.key,
      label: entry.label,
      symbol: menuSymbols[entry.glyph],
    });
    return {
      tab: route,
      name: navigationLabel(t, slot, pinned?.name),
      recent: entries.filter((entry) => entry.glyph !== 'new').map(item),
      actions: entries.filter((entry) => entry.glyph === 'new').map(item),
    };
  });
  const shown = useMemo(() => new Map<string, TabMenuEntry>(), []);
  for (const [tab, entries] of Object.entries(menus))
    for (const entry of entries ?? []) shown.set(`${tab}\n${entry.key}`, entry);
  const select = (tab: string, id: string) => {
    const entry =
      menus[tab as TabMenuRoute]?.find((item) => item.key === id) ?? shown.get(`${tab}\n${id}`);
    shown.clear();
    entry?.run();
  };
  const glyphTrigger = (route: TabRoute, slot: Exclude<(typeof order)[number], 'pinned'>) => (
    <NativeTabs.Trigger
      key={slot}
      name={route}
      accessibilityLabel={navigationLabel(t, slot)}
      testID={
        slot === 'settings'
          ? 'settings-button'
          : slot === 'sessions'
            ? 'sessions-tab'
            : `navigation-${slot}`
      }
    >
      <NativeTabs.Trigger.Icon sf={tabSymbols[slot]} />
      <NativeTabs.Trigger.Label hidden />
      {slot === 'activity' && pending > 0 ? (
        <NativeTabs.Trigger.Badge>{badgeCount(pending)}</NativeTabs.Trigger.Badge>
      ) : null}
    </NativeTabs.Trigger>
  );
  return (
    <FloatingTabInset.Provider value={islandTop + space.x5}>
      <TabChromeContext value={chrome}>
        <View ref={profileSetup.load} collapsable={false} />
        <View ref={profileSetup.prompt} collapsable={false} />
        <View ref={loadMenus} collapsable={false} />
        {avatar.capture}
        <WorkspacePager>
          <View ref={quickActions} collapsable={false} style={{ flex: 1 }}>
            <NativeTabs
              tintColor={theme.color.fg}
              hidden={hiddenNow || drawerOpen}
              screenListeners={({ route }) => ({
                focus: () => setFocusedRoute(route.name),
                tabPress: () => {
                  if (route.name === '(sessions)')
                    landInSessionsTab(focusedNow.current === route.name, sessionsStack(route));
                },
              })}
            >
              {order.map((slot) =>
                slot === 'pinned' ? (
                  <NativeTabs.Trigger
                    key={slot}
                    name={tabRoute(slot)}
                    accessibilityLabel={pinned?.label ?? t.pinnedTab.title}
                    testID="navigation-pinned"
                  >
                    {avatar.icons === undefined ? (
                      <NativeTabs.Trigger.Icon sf={pinnedSymbols} />
                    ) : (
                      <NativeTabs.Trigger.Icon src={avatar.icons} renderingMode="original" />
                    )}
                    <NativeTabs.Trigger.Label hidden />
                    {pinned !== undefined && pinned.count > 0 ? (
                      <NativeTabs.Trigger.Badge>
                        {badgeCount(pinned.count)}
                      </NativeTabs.Trigger.Badge>
                    ) : null}
                  </NativeTabs.Trigger>
                ) : (
                  glyphTrigger(tabRoute(slot), slot)
                ),
              )}
            </NativeTabs>
            <NativeTabMenus tabs={specs} pill onSelect={select} />
          </View>
        </WorkspacePager>
      </TabChromeContext>
    </FloatingTabInset.Provider>
  );
}
