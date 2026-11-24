import { Platform, Pressable, View } from 'react-native';
import { pressTint, useDesignTheme } from '../design/theme';
import { materialNavigationBar, navigationBar } from '../design/tokens';
import { NavigationIcon } from './navigation-icon';
import { badgeCount } from '../primitives/badge-count';
import { ChatsIcon, ActivityIcon, SettingsIcon, AssignmentSessionIcon } from './icons';
import { useStrings } from '../strings';
import type { NavigationDestination } from './navigation-destination';
import { navigationLabel } from './navigation-label';
export function NavigationDestinations({ items }: { items: NavigationDestination[] }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const android = Platform.OS === 'android';
  return (
    <>
      {items.map((item) => {
        const { focused, activity, settings, sessions, count: pending } = item;
        const Icon = settings
          ? SettingsIcon
          : activity
            ? ActivityIcon
            : sessions
              ? AssignmentSessionIcon
              : ChatsIcon;
        const label = navigationLabel(t, item);
        return (
          <Pressable
            key={item.key}
            testID={settings ? 'settings-button' : sessions ? 'sessions-tab' : `tab-${item.key}`}
            accessibilityRole="tab"
            accessibilityLabel={
              activity && pending > 0 ? `${label}, ${badgeCount(pending)}` : label
            }
            accessibilityState={{ selected: focused }}
            onPress={item.onPress}
            onLongPress={item.onLongPress}
            android_ripple={{
              color: pressTint(theme.color.fg),
              borderless: true,
              radius: materialNavigationBar.indicatorWidth / 2,
            }}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: theme.touch,
            }}
          >
            <View
              style={{
                width: '100%',
                height: android
                  ? materialNavigationBar.indicatorHeight
                  : Math.max(navigationBar.indicatorHeight, theme.type.title.line),
              }}
            >
              <NavigationIcon
                focused={focused}
                color={focused ? theme.color.fg : theme.color.muted}
                count={activity ? pending : 0}
                countVisible={!focused}
              >
                <Icon
                  color={focused ? theme.color.fg : theme.color.muted}
                  size={theme.type.title.line}
                />
              </NavigationIcon>
            </View>
          </Pressable>
        );
      })}
    </>
  );
}
