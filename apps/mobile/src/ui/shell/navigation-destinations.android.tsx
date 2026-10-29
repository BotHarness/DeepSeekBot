import {
  BadgedBox,
  Host,
  NavigationBar,
  NavigationBarItem,
  Icon,
  Text,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, testID, weight } from '@expo/ui/jetpack-compose/modifiers';
import { useDesignTheme } from '../design/theme';
import { materialNavigationBar } from '../design/tokens';
import { badgeCount } from '../primitives/badge-count';
import { MaterialDotBadge } from '../primitives/count-badge.android';
import { useStrings } from '../strings';
import type { NavigationDestination } from './navigation-destination';

export function NavigationDestinations({ items }: { items: NavigationDestination[] }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const colors = {
    selectedIconColor: theme.color.fg,
    selectedTextColor: theme.color.fg,
    selectedIndicatorColor: theme.layer.raised.chosen,
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
        containerColor={theme.layer.raised.fill}
        contentColor={theme.color.fg}
        tonalElevation={0}
        modifiers={[fillMaxWidth(), testID('android-navigation-bar')]}
      >
        {items.map((item) => {
          const showCount = item.activity && item.count > 0;
          const normal = item.search
            ? t.localSearch.title
            : item.settings
              ? t.settings
              : item.activity
                ? t.activity
                : t.chats;
          const pending = t.activityPendingLabel(badgeCount(item.count));
          const icon = (
            <Icon
              source={
                item.search
                  ? require('../../../assets/header/search.xml')
                  : item.settings
                    ? require('../../../assets/toolbar/settings.xml')
                    : item.activity
                      ? require('../../../assets/toolbar/activity.xml')
                      : require('../../../assets/toolbar/chats.xml')
              }
              size={materialNavigationBar.iconSize}
            />
          );
          return (
            <NavigationBarItem
              key={item.key}
              selected={item.focused}
              alwaysShowLabel
              onClick={item.onPress}
              colors={colors}
              modifiers={[
                weight(1),
                testID(
                  item.search
                    ? 'navigation-search'
                    : item.settings
                      ? 'settings-button'
                      : item.activity
                        ? 'navigation-activity'
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
              <NavigationBarItem.Label>
                <Text style={{ typography: 'labelMedium', textAlign: 'center' }}>{normal}</Text>
              </NavigationBarItem.Label>
            </NavigationBarItem>
          );
        })}
      </NavigationBar>
    </Host>
  );
}
