import { Platform, Pressable, View } from 'react-native';
import { pressTint, useDesignTheme } from '../design/theme';
import { materialNavigationBar, navigationBar, radius } from '../design/tokens';
import { NavigationIcon } from './navigation-icon';
import { Text } from '../primitives/text';
import { badgeCount } from '../primitives/badge-count';
import { ChatsIcon, ActivityIcon } from './icons';
import { t } from '../strings';
import type { NavigationDestination } from './navigation-destination';
export function NavigationDestinations({ items }: { items: NavigationDestination[] }) {
  const theme = useDesignTheme();
  const android = Platform.OS === 'android';
  return (
    <>
      {items.map((item) => {
        const { focused, activity, count: pending } = item;
        const Icon = activity ? ActivityIcon : ChatsIcon;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={
              activity && pending > 0
                ? `${t.activity}, ${badgeCount(pending)}`
                : activity
                  ? t.activity
                  : t.chats
            }
            accessibilityState={{ selected: focused }}
            onPress={item.onPress}
            onLongPress={item.onLongPress}
            android_ripple={{
              color: pressTint(theme.color.fg),
              borderless: true,
              radius: materialNavigationBar.indicatorWidth / 2,
            }}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: theme.touch,
              gap: android ? materialNavigationBar.iconLabelGap : 0,
              borderRadius: radius.round,
              backgroundColor:
                !android && (pressed || focused) ? theme.layer.raised.chosen : 'transparent',
            })}
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
            <Text variant="meta" strong={android && focused} tone={focused ? 'fg' : 'muted'}>
              {activity ? t.activity : t.chats}
            </Text>
          </Pressable>
        );
      })}
    </>
  );
}
