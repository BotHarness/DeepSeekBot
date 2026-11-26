import {
  BadgedBox,
  Box,
  Host,
  HorizontalFloatingToolbar,
  Icon,
  Image,
} from '@expo/ui/jetpack-compose';
import {
  background,
  clip,
  combinedClickable,
  padding,
  paddingAll,
  Shapes,
  size,
  testID,
} from '@expo/ui/jetpack-compose/modifiers';
import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useAvatarIcons } from '../../features/pinned-tab/avatar-icon';
import { useDesignTheme } from '../design/theme';
import { cornerBadge, floatingToolbar } from '../design/tokens';
import { MaterialCountBadge } from '../primitives/count-badge.android';
import { useStrings } from '../strings';
import { toolbarGap, type NavigationDestination } from './navigation-destination';
import type { TabSlot } from './tab-slots';

function glyphFor(slot: TabSlot, focused: boolean) {
  if (slot === 'settings')
    return focused
      ? require('../../../assets/toolbar/settings.xml')
      : require('../../../assets/toolbar/settings-outline.xml');
  if (slot === 'activity')
    return focused
      ? require('../../../assets/toolbar/activity-filled.xml')
      : require('../../../assets/toolbar/activity.xml');
  if (slot === 'sessions') return require('../../../assets/toolbar/code.xml');
  return focused
    ? require('../../../assets/toolbar/chats-filled.xml')
    : require('../../../assets/toolbar/chats.xml');
}

export function tabTestID(slot: TabSlot): string {
  if (slot === 'settings') return 'settings-button';
  if (slot === 'activity') return 'navigation-activity';
  if (slot === 'sessions') return 'sessions-tab';
  if (slot === 'pinned') return 'navigation-pinned';
  return 'navigation-chats';
}

export function NavigationDestinations({ items }: { items: NavigationDestination[] }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const { item, height, inset } = floatingToolbar;
  const gap = toolbarGap(useWindowDimensions().width, items.length);
  const avatar = useAvatarIcons(
    items.find((entry) => entry.slot === 'pinned')?.conversation,
    floatingToolbar.avatar,
  );
  const badged = (entry: NavigationDestination, face: ReactNode) =>
    entry.count === 0 ? (
      face
    ) : (
      <BadgedBox>
        <BadgedBox.Badge>
          <MaterialCountBadge
            count={entry.count}
            tone={entry.slot === 'activity' ? 'needs-you' : 'unread'}
            fontSize={
              (cornerBadge.materialLabel * Math.min(theme.fontScale, cornerBadge.maxTextScale)) /
              theme.fontScale
            }
          />
        </BadgedBox.Badge>
        {face}
      </BadgedBox>
    );
  const face = (entry: NavigationDestination) =>
    entry.slot === 'pinned' ? (
      avatar.icons === undefined ? (
        <Box modifiers={[size(floatingToolbar.avatar, floatingToolbar.avatar)]} />
      ) : (
        <Image
          source={entry.focused ? avatar.icons.selected : avatar.icons.default}
          contentDescription={null}
          modifiers={[size(floatingToolbar.avatar, floatingToolbar.avatar)]}
        />
      )
    ) : (
      <Icon
        source={glyphFor(entry.slot, entry.focused)}
        size={floatingToolbar.icon}
        tint={entry.focused ? theme.color.fg : theme.color.muted}
      />
    );
  return (
    <View collapsable={false}>
      <View importantForAccessibility="no-hide-descendants">
        <Host
          key={theme.scheme}
          matchContents
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
          ignoreSafeAreaKeyboardInsets
        >
          <Box modifiers={[paddingAll(inset)]}>
            <HorizontalFloatingToolbar
              colors={{
                toolbarContainerColor: theme.color.base,
                toolbarContentColor: theme.color.fg,
              }}
              modifiers={[testID('android-navigation-bar')]}
            >
              {items.map((entry, index) => (
                <Box
                  key={entry.key}
                  contentAlignment="center"
                  modifiers={[
                    padding(index === 0 ? 0 : gap, 0, 0, 0),
                    size(item, height),
                    clip(Shapes.RoundedCorner(height / 2)),
                    background(entry.focused ? theme.layer.raised.chosen : 'transparent'),
                    combinedClickable({ onClick: entry.onPress, onLongClick: entry.onLongPress }),
                    testID(tabTestID(entry.slot)),
                  ]}
                >
                  {badged(entry, face(entry))}
                </Box>
              ))}
            </HorizontalFloatingToolbar>
          </Box>
        </Host>
      </View>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
        ]}
      >
        {items.map((entry, index) => (
          <View
            key={entry.key}
            testID={`${tabTestID(entry.slot)}-a11y`}
            accessible
            accessibilityRole="tab"
            accessibilityLabel={entry.accessibilityLabel}
            accessibilityState={{ selected: entry.focused }}
            accessibilityActions={[
              { name: 'activate' },
              ...(entry.menu === undefined ? [] : [{ name: 'longpress', label: t.tabMenuAction }]),
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'activate') entry.onPress();
              if (nativeEvent.actionName === 'longpress') entry.onLongPress();
            }}
            style={{ width: item, height, marginLeft: index === 0 ? 0 : gap }}
          />
        ))}
      </View>
      {avatar.capture}
    </View>
  );
}
