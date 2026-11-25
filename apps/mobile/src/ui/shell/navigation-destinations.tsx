import { Pressable, View } from 'react-native';
import { PinnedAvatar } from '../../features/pinned-tab/pinned-avatar';
import { pressTint, useDesignTheme } from '../design/theme';
import { navigationBar } from '../design/tokens';
import { NavigationIcon } from './navigation-icon';
import { ChatsIcon, ActivityIcon, SettingsIcon, CodeIcon } from './icons';
import type { NavigationDestination } from './navigation-destination';

export function NavigationDestinations({ items }: { items: NavigationDestination[] }) {
  const theme = useDesignTheme();
  return (
    <>
      {items.map((item) => {
        const { focused, slot } = item;
        const color = focused ? theme.color.fg : theme.color.muted;
        const Icon =
          slot === 'settings'
            ? SettingsIcon
            : slot === 'activity'
              ? ActivityIcon
              : slot === 'sessions'
                ? CodeIcon
                : ChatsIcon;
        return (
          <Pressable
            key={item.key}
            testID={
              slot === 'settings'
                ? 'settings-button'
                : slot === 'sessions'
                  ? 'sessions-tab'
                  : `tab-${item.key}`
            }
            accessibilityRole="tab"
            accessibilityLabel={item.accessibilityLabel}
            accessibilityState={{ selected: focused }}
            onPress={item.onPress}
            onLongPress={item.onLongPress}
            android_ripple={{ color: pressTint(theme.color.fg), borderless: true }}
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
                height: Math.max(navigationBar.indicatorHeight, theme.type.title.line),
              }}
            >
              <NavigationIcon
                focused={focused}
                color={color}
                count={item.count}
                countVisible={!focused}
              >
                {slot === 'pinned' ? (
                  <PinnedAvatar
                    conversation={item.conversation}
                    size={navigationBar.symbolBox}
                    selected={focused}
                  />
                ) : (
                  <Icon color={color} size={theme.type.title.line} />
                )}
              </NavigationIcon>
            </View>
          </Pressable>
        );
      })}
    </>
  );
}
