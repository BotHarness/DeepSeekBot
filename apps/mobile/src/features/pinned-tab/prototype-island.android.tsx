import {
  Badge,
  BadgedBox,
  Host,
  Icon,
  NavigationBar,
  NavigationBarItem,
  RNHostView,
  Text,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, size, testID, weight } from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';
import { useDesignTheme } from '../../ui/design/theme';
import { materialNavigationBar, space } from '../../ui/design/tokens';
import { badgeCount } from '../../ui/primitives/badge-count';
import { MaterialCountBadge } from '../../ui/primitives/count-badge.android';
import { useStrings } from '../../ui/strings';
import { PinnedAvatar } from './pinned-avatar';
import { pinnedTabOrder, type PinnedIslandProps, type PinnedTabSlot } from './prototype-model';

function glyphFor(slot: PinnedTabSlot, focused: boolean) {
  if (slot === 'settings')
    return focused
      ? require('../../../assets/toolbar/settings.xml')
      : require('../../../assets/toolbar/settings-outline.xml');
  if (slot === 'activity')
    return focused
      ? require('../../../assets/toolbar/activity-filled.xml')
      : require('../../../assets/toolbar/activity.xml');
  if (slot === 'sessions')
    return focused
      ? require('../../../assets/toolbar/sessions-filled.xml')
      : require('../../../assets/toolbar/sessions.xml');
  if (slot === 'pinned')
    return focused
      ? require('../../../assets/toolbar/pinned-filled.xml')
      : require('../../../assets/toolbar/pinned.xml');
  return focused
    ? require('../../../assets/toolbar/chats-filled.xml')
    : require('../../../assets/toolbar/chats.xml');
}

export function PinnedIsland({ prototype, target, selected, onSelect }: PinnedIslandProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  const colors = {
    selectedIconColor: theme.color.fg,
    selectedTextColor: theme.color.fg,
    selectedIndicatorColor: theme.layer.raised.chosen,
    unselectedIconColor: theme.color.muted,
    unselectedTextColor: theme.color.muted,
  };
  const name = (slot: PinnedTabSlot) =>
    slot === 'pinned'
      ? target.name
      : slot === 'chats'
        ? t.chats
        : slot === 'activity'
          ? t.activity
          : slot === 'sessions'
            ? t.hostSessions.title
            : t.settings;
  const description = (slot: PinnedTabSlot) =>
    slot === 'pinned'
      ? [
          t.pinnedTabFixture.tabLabel(target.name),
          ...(target.unread > 0 ? [t.pinnedTabFixture.unread(badgeCount(target.unread))] : []),
        ].join(', ')
      : name(slot);
  const avatarSize = materialNavigationBar.iconSize + space.x3;
  const badgeSize = materialNavigationBar.iconSize / 2 + space.x2;
  const pinnedIcon = (focused: boolean) => {
    if (prototype === 'avatar') {
      const avatar = (
        <RNHostView modifiers={[size(avatarSize, avatarSize)]}>
          <View>
            <PinnedAvatar target={target} size={avatarSize} selected={focused} unread={false} />
          </View>
        </RNHostView>
      );
      return target.unread > 0 ? (
        <BadgedBox>
          <BadgedBox.Badge>
            <MaterialCountBadge count={target.unread} tone="unread" />
          </BadgedBox.Badge>
          {avatar}
        </BadgedBox>
      ) : (
        avatar
      );
    }
    return (
      <BadgedBox>
        <BadgedBox.Badge>
          <Badge containerColor={theme.color.base}>
            <RNHostView modifiers={[size(badgeSize, badgeSize)]}>
              <View>
                <PinnedAvatar
                  target={target}
                  size={badgeSize}
                  selected={false}
                  ring={false}
                  unread={false}
                />
              </View>
            </RNHostView>
          </Badge>
        </BadgedBox.Badge>
        <Icon source={glyphFor('pinned', focused)} size={materialNavigationBar.iconSize} />
      </BadgedBox>
    );
  };
  return (
    <Host
      key={`${theme.scheme}-${prototype}`}
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
        modifiers={[fillMaxWidth(), testID(`pinned-fixture-bar-${prototype}`)]}
      >
        {pinnedTabOrder.map((slot) => {
          const focused = slot === selected;
          return (
            <NavigationBarItem
              key={slot}
              selected={focused}
              alwaysShowLabel={slot === 'pinned' && prototype === 'avatar'}
              onClick={() => onSelect(slot)}
              colors={colors}
              modifiers={[
                weight(1),
                testID(`pinned-fixture-${slot}`),
                semantics({ contentDescription: description(slot) }),
              ]}
            >
              <NavigationBarItem.Icon>
                {slot === 'pinned' ? (
                  pinnedIcon(focused)
                ) : (
                  <Icon source={glyphFor(slot, focused)} size={materialNavigationBar.iconSize} />
                )}
              </NavigationBarItem.Icon>
              <NavigationBarItem.Label>
                <Text
                  maxLines={1}
                  overflow="ellipsis"
                  style={{ typography: 'labelMedium', textAlign: 'center' }}
                >
                  {name(slot)}
                </Text>
              </NavigationBarItem.Label>
            </NavigationBarItem>
          );
        })}
      </NavigationBar>
    </Host>
  );
}
