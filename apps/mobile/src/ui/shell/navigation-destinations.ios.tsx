import { Button, Host, HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityHidden,
  accessibilityLabel,
  background,
  buttonStyle,
  dynamicTypeSize,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  onLongPressGesture,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { navigationBar, space } from '../design/tokens';
import { badgeCount } from '../primitives/badge-count';
import { useStrings } from '../strings';
import type { NavigationDestination } from './navigation-destination';
import { navigationLabel } from './navigation-label';

export const tabSymbols = {
  chats: ['bubble.left.and.bubble.right', 'bubble.left.and.bubble.right.fill'],
  activity: ['bell', 'bell.fill'],
  sessions: ['list.bullet.rectangle', 'list.bullet.rectangle.fill'],
  settings: ['gearshape', 'gearshape.fill'],
} as const;

function symbolFor(item: NavigationDestination): TabSymbol {
  const [outline, filled] = item.settings
    ? tabSymbols.settings
    : item.activity
      ? tabSymbols.activity
      : item.sessions
        ? tabSymbols.sessions
        : tabSymbols.chats;
  return item.focused ? filled : outline;
}

type TabSymbol = (typeof tabSymbols)[keyof typeof tabSymbols][number];

const symbolBox = frame({
  maxWidth: Infinity,
  minHeight: navigationBar.symbolBox,
  maxHeight: navigationBar.symbolBox,
});
const symbolSize = dynamicTypeSize({ max: 'xxxLarge' });

export function NavigationDestinations({ items }: { items: NavigationDestination[] }) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <Host key={theme.scheme} style={{ flex: 1 }} colorScheme={theme.scheme}>
      <HStack
        spacing={space.x2}
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
          accessibilityAddTraits(['isTabBar']),
        ]}
      >
        {items.map((item) => {
          const label = navigationLabel(t, item);
          const accessibility = item.count > 0 ? `${label}, ${badgeCount(item.count)}` : label;
          return (
            <Button
              key={item.key}
              testID={
                item.settings
                  ? 'settings-button'
                  : item.sessions
                    ? 'sessions-tab'
                    : `tab-${item.key}`
              }
              onPress={item.onPress}
              modifiers={[
                buttonStyle('plain'),
                background(navigationBar.hitFill, shapes.capsule()),
                onLongPressGesture(item.onLongPress),
                frame({ maxWidth: Infinity, maxHeight: Infinity }),
                accessibilityElement('ignore'),
                accessibilityLabel(accessibility),
                accessibilityAddTraits(item.focused ? ['isButton', 'isSelected'] : ['isButton']),
                foregroundStyle(item.focused ? theme.color.fg : theme.color.muted),
              ]}
            >
              <VStack
                modifiers={[
                  frame({ maxWidth: Infinity, maxHeight: Infinity, minHeight: theme.touch }),
                ]}
              >
                {item.activity && !item.focused && item.count > 0 ? (
                  <Text
                    testID="tab-symbol"
                    modifiers={[
                      font({ textStyle: 'title2', weight: 'semibold' }),
                      symbolSize,
                      monospacedDigit(),
                      lineLimit(1),
                      symbolBox,
                      accessibilityHidden(),
                    ]}
                  >
                    {badgeCount(item.count)}
                  </Text>
                ) : (
                  <Image
                    testID="tab-symbol"
                    systemName={symbolFor(item)}
                    modifiers={[
                      font({ textStyle: 'title2' }),
                      symbolSize,
                      symbolBox,
                      accessibilityHidden(),
                    ]}
                  />
                )}
              </VStack>
            </Button>
          );
        })}
      </HStack>
    </Host>
  );
}
