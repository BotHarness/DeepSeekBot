import {
  Host,
  NavigationBar,
  NavigationBarItem,
  Icon,
  Box,
  Text,
  AnimatedVisibility,
  EnterTransition,
  ExitTransition,
} from '@expo/ui/jetpack-compose';
import {
  fillMaxWidth,
  semantics,
  testID,
  weight,
  defaultMinSize,
} from '@expo/ui/jetpack-compose/modifiers';
import { useReducedMotion } from 'react-native-reanimated';
import { useDesignTheme } from '../design/theme';
import { materialNavigationBar } from '../design/tokens';
import { badgeCount } from '../primitives/badge-count';
import { t } from '../strings';
import type { NavigationDestination } from './navigation-destination';

export function NavigationDestinations({ items }: { items: NavigationDestination[] }) {
  const theme = useDesignTheme();
  const reduced = useReducedMotion();
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
          const normal = item.activity ? t.activity : t.chats;
          const pending = t.activityPendingLabel(badgeCount(item.count));

          const text = (value: string) => (
            <Text
              style={{
                typography: 'titleMedium',
                fontWeight: item.focused ? '600' : '500',
                textAlign: 'center',
              }}
            >
              {value}
            </Text>
          );
          return (
            <NavigationBarItem
              key={item.key}
              selected={item.focused}
              alwaysShowLabel
              onClick={item.onPress}
              colors={{
                selectedIconColor: theme.color.fg,
                selectedTextColor: theme.color.fg,
                selectedIndicatorColor: theme.layer.raised.chosen,
                unselectedIconColor: theme.color.muted,
                unselectedTextColor: theme.color.muted,
              }}
              modifiers={[
                weight(1),
                testID(item.activity ? 'navigation-activity' : 'navigation-chats'),
                semantics({
                  contentDescription:
                    item.activity && showCount ? `${t.activity}, ${pending}` : normal,
                }),
              ]}
            >
              <NavigationBarItem.Icon>
                <Box
                  contentAlignment="center"
                  modifiers={[
                    defaultMinSize({
                      minWidth: materialNavigationBar.iconSize,
                      minHeight: materialNavigationBar.iconSize,
                    }),
                  ]}
                >
                  {reduced ? (
                    showCount ? (
                      text(badgeCount(item.count))
                    ) : (
                      <Icon
                        source={
                          item.activity
                            ? require('../../../assets/toolbar/activity.xml')
                            : require('../../../assets/toolbar/chats.xml')
                        }
                        size={materialNavigationBar.iconSize}
                      />
                    )
                  ) : (
                    <>
                      <AnimatedVisibility
                        visible={!showCount}
                        enterTransition={EnterTransition.fadeIn()}
                        exitTransition={ExitTransition.fadeOut()}
                      >
                        <Icon
                          source={
                            item.activity
                              ? require('../../../assets/toolbar/activity.xml')
                              : require('../../../assets/toolbar/chats.xml')
                          }
                          size={materialNavigationBar.iconSize}
                        />
                      </AnimatedVisibility>
                      <AnimatedVisibility
                        visible={showCount}
                        enterTransition={EnterTransition.fadeIn()}
                        exitTransition={ExitTransition.fadeOut()}
                      >
                        {text(badgeCount(item.count))}
                      </AnimatedVisibility>
                    </>
                  )}
                </Box>
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
