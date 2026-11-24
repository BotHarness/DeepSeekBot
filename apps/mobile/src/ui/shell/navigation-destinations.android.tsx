import { BadgedBox, Host, NavigationBar, NavigationBarItem, Icon } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, testID, weight } from '@expo/ui/jetpack-compose/modifiers';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDesignTheme } from '../design/theme';
import { haptic } from '../haptics';
import { showActionMenu } from '../primitives/app-dialog';
import type { MenuGlyph } from '../primitives/menu-icon';
import { noteTouch } from '../primitives/touch-anchor';
import { ActivityIcon, AssignmentSessionIcon, PlusIcon } from './icons';
import type { TabMenuEntry, TabMenuGlyph } from './tab-menu-model';
import { materialNavigationBar } from '../design/tokens';
import { badgeCount } from '../primitives/badge-count';
import { MaterialDotBadge } from '../primitives/count-badge.android';
import { useStrings } from '../strings';
import type { NavigationDestination } from './navigation-destination';
import { navigationLabel } from './navigation-label';

function iconFor(item: NavigationDestination) {
  if (item.settings)
    return item.focused
      ? require('../../../assets/toolbar/settings.xml')
      : require('../../../assets/toolbar/settings-outline.xml');
  if (item.activity)
    return item.focused
      ? require('../../../assets/toolbar/activity-filled.xml')
      : require('../../../assets/toolbar/activity.xml');
  if (item.sessions)
    return item.focused
      ? require('../../../assets/toolbar/sessions-filled.xml')
      : require('../../../assets/toolbar/sessions.xml');
  return item.focused
    ? require('../../../assets/toolbar/chats-filled.xml')
    : require('../../../assets/toolbar/chats.xml');
}

export function NavigationDestinations({ items }: { items: NavigationDestination[] }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const colors = {
    selectedIconColor: theme.color.fg,
    selectedTextColor: theme.color.fg,
    selectedIndicatorColor: 'transparent',
    unselectedIconColor: theme.color.muted,
    unselectedTextColor: theme.color.muted,
  };
  const [width, setWidth] = useState(0);
  const current = useRef(items);
  current.current = items;
  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .runOnJS(true)
        .onStart((event) => {
          const list = current.current;
          const slot = width / Math.max(list.length, 1);
          const index = Math.min(list.length - 1, Math.max(0, Math.floor(event.x / (slot || 1))));
          const item = list[index];
          if (item?.menu === undefined) return;
          noteTouch({
            nativeEvent: { pageX: slot * (index + 0.5), pageY: event.absoluteY - event.y },
          });
          haptic('menu');
          openTabMenu(navigationLabel(t, item), item.menu);
        }),
    [width, t],
  );
  return (
    <GestureDetector gesture={longPress}>
      <View
        collapsable={false}
        style={{ width: '100%' }}
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      >
        <View importantForAccessibility="no-hide-descendants">
          <Host
            matchContents={{ vertical: true }}
            style={{ width: '100%' }}
            colorScheme={theme.scheme}
            seedColor={theme.color.accent}
            ignoreSafeAreaKeyboardInsets
          >
            <NavigationBar
              containerColor={theme.color.base}
              contentColor={theme.color.fg}
              tonalElevation={0}
              modifiers={[fillMaxWidth(), testID('android-navigation-bar')]}
            >
              {items.map((item) => {
                const showCount = item.activity && item.count > 0;
                const normal = navigationLabel(t, item);
                const pending = t.activityPendingLabel(badgeCount(item.count));
                const icon = <Icon source={iconFor(item)} size={materialNavigationBar.iconSize} />;
                return (
                  <NavigationBarItem
                    key={item.key}
                    selected={item.focused}
                    alwaysShowLabel={false}
                    onClick={item.onPress}
                    colors={colors}
                    modifiers={[
                      weight(1),
                      testID(tabTestID(item)),
                      semantics({
                        contentDescription:
                          item.activity && showCount ? `${t.activity}, ${pending}` : normal,
                      }),
                    ]}
                  >
                    <NavigationBarItem.Icon>
                      {showCount ? (
                        <BadgedBox>
                          <BadgedBox.Badge>
                            <MaterialDotBadge tone="needs-you" />
                          </BadgedBox.Badge>
                          {icon}
                        </BadgedBox>
                      ) : (
                        icon
                      )}
                    </NavigationBarItem.Icon>
                  </NavigationBarItem>
                );
              })}
            </NavigationBar>
          </Host>
        </View>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
          {items.map((item) => {
            const label = navigationLabel(t, item);
            const menu = item.menu;
            return (
              <View
                key={item.key}
                testID={`${tabTestID(item)}-a11y`}
                accessible
                accessibilityRole="tab"
                accessibilityLabel={
                  item.activity && item.count > 0
                    ? `${t.activity}, ${t.activityPendingLabel(badgeCount(item.count))}`
                    : label
                }
                accessibilityState={{ selected: item.focused }}
                accessibilityActions={[
                  { name: 'activate' },
                  ...(menu === undefined ? [] : [{ name: 'longpress', label: t.tabMenuAction }]),
                ]}
                onAccessibilityAction={({ nativeEvent }) => {
                  if (nativeEvent.actionName === 'activate') item.onPress();
                  if (nativeEvent.actionName === 'longpress' && menu !== undefined)
                    openTabMenu(label, menu);
                }}
                style={{ flex: 1 }}
              />
            );
          })}
        </View>
      </View>
    </GestureDetector>
  );
}

function tabTestID(item: NavigationDestination): string {
  return item.settings
    ? 'settings-button'
    : item.activity
      ? 'navigation-activity'
      : item.sessions
        ? 'sessions-tab'
        : 'navigation-chats';
}

const menuGlyphs: Record<TabMenuGlyph, MenuGlyph> = {
  bot: 'chat',
  channel: 'channel',
  person: 'person',
  session: AssignmentSessionIcon,
  activity: ActivityIcon,
  new: PlusIcon,
};

function openTabMenu(title: string, entries: readonly TabMenuEntry[]) {
  showActionMenu(
    title,
    entries.map((entry) => ({
      text: entry.label,
      icon: menuGlyphs[entry.glyph],
      onPress: entry.run,
    })),
  );
}
