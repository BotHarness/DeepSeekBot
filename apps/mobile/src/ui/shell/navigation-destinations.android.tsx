import { BadgedBox, Host, NavigationBar, NavigationBarItem, Icon } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, testID, weight } from '@expo/ui/jetpack-compose/modifiers';
import { useDesignTheme } from '../design/theme';
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
  return (
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
                testID(
                  item.settings
                    ? 'settings-button'
                    : item.activity
                      ? 'navigation-activity'
                      : item.sessions
                        ? 'sessions-tab'
                        : 'navigation-chats',
                ),
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
  );
}
