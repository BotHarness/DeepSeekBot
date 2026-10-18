import { Platform, Pressable, View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { navigationBar, radius } from '../design/tokens';
import { NavigationIcon } from './navigation-icon';
import { Text } from '../primitives/text';
import { badgeCount } from '../primitives/badge-count';
import { ChatsIcon, ActivityIcon, ActivitySearchIcon } from './icons';
import { t } from '../strings';
import type { NavigationDestination } from './navigation-destination';
export function NavigationDestinations({ items }: { items: NavigationDestination[] }) {
  const theme = useDesignTheme();
  return (
    <>
      {items.map((item) => {
        const { focused, activity, count: pending } = item;
        const Icon = item.search ? ActivitySearchIcon : activity ? ActivityIcon : ChatsIcon;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={
              item.search
                ? t.localSearch.title
                : activity && pending > 0
                  ? `${t.activity}, ${badgeCount(pending)}`
                  : activity
                    ? t.activity
                    : t.chats
            }
            accessibilityState={{ selected: focused }}
            onPress={item.onPress}
            onLongPress={item.onLongPress}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: theme.touch,
              borderRadius: radius.round,
              backgroundColor:
                pressed || (focused && Platform.OS !== 'android')
                  ? theme.layer.raised.chosen
                  : 'transparent',
            })}
          >
            <View
              style={{
                width: '100%',
                height: Math.max(navigationBar.indicatorHeight, theme.type.title.line),
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
            <Text variant="meta" tone={focused ? 'fg' : 'muted'}>
              {item.search ? t.localSearch.title : activity ? t.activity : t.chats}
            </Text>
          </Pressable>
        );
      })}
    </>
  );
}
