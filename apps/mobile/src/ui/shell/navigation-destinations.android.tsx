import {
  Host,
  NavigationBar,
  NavigationBarItem,
  Icon,
  Row,
  Box,
  Text,
  AnimatedVisibility,
  EnterTransition,
  ExitTransition,
} from '@expo/ui/jetpack-compose';
import {
  animateContentSize,
  fillMaxWidth,
  semantics,
  testID,
  weight,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { badgeCount } from '../primitives/badge-count';
import { t } from '../strings';
import type { NavigationDestination } from './navigation-destination';

export function NavigationDestinations({ items }: { items: NavigationDestination[] }) {
  const theme = useDesignTheme();
  const reduced = useReducedMotion();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const itemWidth = Math.max(
    theme.touch,
    (window.width - insets.left - insets.right) / items.length - space.x6 * 2,
  );
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
          const label = showCount ? pending : normal;
          const text = (value: string) => (
            <Text
              style={{
                typography: 'labelLarge',
                fontWeight: item.focused ? '600' : '500',
                textAlign: 'start',
              }}
            >
              {value}
            </Text>
          );
          return (
            <NavigationBarItem
              key={item.key}
              selected={item.focused}
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
                    item.activity && showCount ? `${t.activity}, ${pending}` : label,
                }),
              ]}
            >
              <NavigationBarItem.Icon>
                <Row
                  verticalAlignment="center"
                  horizontalArrangement={{ spacedBy: space.x2 }}
                  modifiers={[width(itemWidth)]}
                >
                  <Icon
                    source={
                      item.activity
                        ? require('../../../assets/toolbar/activity.xml')
                        : require('../../../assets/toolbar/chats.xml')
                    }
                    size={theme.type.title.line}
                  />
                  <Box
                    contentAlignment="centerStart"
                    modifiers={[weight(1), ...(reduced ? [] : [animateContentSize()])]}
                  >
                    {reduced ? (
                      text(label)
                    ) : (
                      <>
                        <AnimatedVisibility
                          visible={!showCount}
                          enterTransition={EnterTransition.fadeIn()}
                          exitTransition={ExitTransition.fadeOut()}
                        >
                          {text(normal)}
                        </AnimatedVisibility>
                        <AnimatedVisibility
                          visible={showCount}
                          enterTransition={EnterTransition.fadeIn()}
                          exitTransition={ExitTransition.fadeOut()}
                        >
                          {text(pending)}
                        </AnimatedVisibility>
                      </>
                    )}
                  </Box>
                </Row>
              </NavigationBarItem.Icon>
            </NavigationBarItem>
          );
        })}
      </NavigationBar>
    </Host>
  );
}
