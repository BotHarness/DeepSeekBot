import {
  BadgedBox,
  Box,
  Host,
  HorizontalFloatingToolbar,
  Icon,
  RNHostView,
} from '@expo/ui/jetpack-compose';
import {
  background,
  clip,
  combinedClickable,
  Shapes,
  size,
  testID,
} from '@expo/ui/jetpack-compose/modifiers';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDesignTheme } from '../../ui/design/theme';
import { cornerBadge, floatingToolbar } from '../../ui/design/tokens';
import { MaterialCountBadge } from '../../ui/primitives/count-badge.android';
import { PinnedAvatar } from './pinned-avatar';
import type { IslandToolbarProps } from './island-model';
import type { PinnedTabSlot } from './prototype-model';

function glyphFor(slot: PinnedTabSlot, focused: boolean) {
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

export function IslandToolbar({ items, target, onLayout }: IslandToolbarProps) {
  const theme = useDesignTheme();
  const [width, setWidth] = useState(0);
  const { item, height } = floatingToolbar;
  const padFor = (total: number) => Math.max(0, (total - item * items.length) / 2);
  const pad = padFor(width);
  const avatar = (focused: boolean) => {
    const face = (
      <RNHostView modifiers={[size(floatingToolbar.avatar, floatingToolbar.avatar)]}>
        <View>
          <PinnedAvatar
            target={target}
            size={floatingToolbar.avatar}
            selected={focused}
            unread={false}
          />
        </View>
      </RNHostView>
    );
    if (target.unread === 0) return face;
    return (
      <BadgedBox>
        <BadgedBox.Badge>
          <MaterialCountBadge
            count={target.unread}
            tone="unread"
            fontSize={cornerBadge.materialLabel / theme.fontScale}
          />
        </BadgedBox.Badge>
        {face}
      </BadgedBox>
    );
  };
  return (
    <View
      collapsable={false}
      onLayout={({ nativeEvent }) => {
        setWidth(nativeEvent.layout.width);
        onLayout?.({
          width: nativeEvent.layout.width,
          height: nativeEvent.layout.height,
          pad: padFor(nativeEvent.layout.width),
        });
      }}
    >
      <View importantForAccessibility="no-hide-descendants">
        <Host
          key={theme.scheme}
          matchContents
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
          ignoreSafeAreaKeyboardInsets
        >
          <HorizontalFloatingToolbar
            colors={{
              toolbarContainerColor: theme.layer.raised.fill,
              toolbarContentColor: theme.color.fg,
            }}
            modifiers={[testID('pinned-island-toolbar')]}
          >
            {items.map((entry) => (
              <Box
                key={entry.slot}
                contentAlignment="center"
                modifiers={[
                  size(item, height),
                  clip(Shapes.RoundedCorner(height / 2)),
                  background(entry.focused ? theme.layer.raised.chosen : 'transparent'),
                  combinedClickable({ onClick: entry.onPress, onLongClick: entry.onLongPress }),
                  testID(`pinned-island-${entry.slot}`),
                ]}
              >
                {entry.slot === 'pinned' ? (
                  avatar(entry.focused)
                ) : (
                  <Icon
                    source={glyphFor(entry.slot, entry.focused)}
                    size={floatingToolbar.icon}
                    tint={entry.focused ? theme.color.fg : theme.color.muted}
                  />
                )}
              </Box>
            ))}
          </HorizontalFloatingToolbar>
        </Host>
      </View>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { flexDirection: 'row', paddingHorizontal: pad, alignItems: 'center' },
        ]}
      >
        {items.map((entry) => (
          <View
            key={entry.slot}
            testID={`pinned-island-${entry.slot}-a11y`}
            accessible
            accessibilityRole="tab"
            accessibilityLabel={entry.label}
            accessibilityState={{ selected: entry.focused }}
            accessibilityActions={[
              { name: 'activate' },
              ...(entry.menuLabel === undefined
                ? []
                : [{ name: 'longpress', label: entry.menuLabel }]),
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'activate') entry.onPress();
              if (nativeEvent.actionName === 'longpress') entry.onLongPress();
            }}
            style={{ width: item, height }}
          />
        ))}
      </View>
    </View>
  );
}
