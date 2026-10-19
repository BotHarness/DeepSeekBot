import { Button, Host, HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  onLongPressGesture,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { navigationBar, space } from '../design/tokens';
import { badgeCount } from '../primitives/badge-count';
import { t } from '../strings';
import type { NavigationDestination } from './navigation-destination';

export function NavigationDestinations({ items }: { items: NavigationDestination[] }) {
  const theme = useDesignTheme();
  const glass = Number.parseInt(String(Platform.Version), 10) >= 26;
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
          const label = item.activity ? t.activity : t.chats;
          const accessibility = item.count > 0 ? `${label}, ${badgeCount(item.count)}` : label;
          return (
            <Button
              key={item.key}
              onPress={item.onPress}
              modifiers={[
                buttonStyle(item.focused ? (glass ? 'glass' : 'bordered') : 'plain'),
                buttonBorderShape('capsule'),
                onLongPressGesture(item.onLongPress),
                frame({ maxWidth: Infinity, maxHeight: Infinity }),
                accessibilityElement('ignore'),
                accessibilityLabel(accessibility),
                accessibilityAddTraits(item.focused ? ['isSelected'] : []),
                foregroundStyle(item.focused ? theme.color.fg : theme.color.muted),
              ]}
            >
              <VStack
                spacing={space.x1}
                modifiers={[frame({ maxWidth: Infinity, minHeight: theme.touch })]}
              >
                {item.activity && !item.focused && item.count > 0 ? (
                  <Text
                    modifiers={[
                      font({ textStyle: 'title2', weight: 'semibold' }),
                      monospacedDigit(),
                    ]}
                  >
                    {badgeCount(item.count)}
                  </Text>
                ) : (
                  <Image
                    systemName={
                      item.activity
                        ? item.focused
                          ? 'bell.fill'
                          : 'bell'
                        : item.focused
                          ? 'bubble.left.and.bubble.right.fill'
                          : 'bubble.left.and.bubble.right'
                    }
                    modifiers={[font({ textStyle: 'title2' })]}
                  />
                )}
                <Text
                  modifiers={[
                    font({ textStyle: 'caption2' }),
                    lineLimit(1),
                    minimumScaleFactor(navigationBar.labelMinScale),
                  ]}
                >
                  {label}
                </Text>
              </VStack>
            </Button>
          );
        })}
      </HStack>
    </Host>
  );
}
