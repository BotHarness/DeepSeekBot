import { Button, Host, HStack, Image, Popover, Text, VStack } from '@expo/ui/swift-ui';
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
  glassEffect,
  lineLimit,
  monospacedDigit,
  onLongPressGesture,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
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

export function NavigationDestinations({
  items,
  labels = true,
}: {
  items: NavigationDestination[];
  labels?: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [peek, setPeek] = useState<string>();
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
          const label = navigationLabel(t, item);
          const accessibility = item.count > 0 ? `${label}, ${badgeCount(item.count)}` : label;
          const button = (
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
                ...(item.focused
                  ? [
                      glass
                        ? glassEffect({
                            glass: { variant: 'regular', interactive: true },
                            shape: 'capsule',
                          })
                        : background(theme.layer.raised.pressed, shapes.capsule()),
                    ]
                  : []),
                onLongPressGesture(() => {
                  item.onLongPress();
                  if (!labels) setPeek(item.key);
                }),
                frame({ maxWidth: Infinity, maxHeight: Infinity }),
                accessibilityElement('ignore'),
                accessibilityLabel(accessibility),
                accessibilityAddTraits(item.focused ? ['isSelected'] : []),
                foregroundStyle(item.focused ? theme.color.fg : theme.color.muted),
              ]}
            >
              <VStack
                spacing={space.x1}
                modifiers={[
                  padding({ horizontal: navigationBar.labelInset, vertical: space.x1 }),
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
                    ]}
                  >
                    {badgeCount(item.count)}
                  </Text>
                ) : (
                  <Image
                    testID="tab-symbol"
                    systemName={symbolFor(item)}
                    modifiers={[font({ textStyle: 'title2' }), symbolSize, symbolBox]}
                  />
                )}
                {labels ? (
                  <Text
                    testID="tab-label"
                    modifiers={[font({ textStyle: 'caption2' }), lineLimit(1)]}
                  >
                    {label}
                  </Text>
                ) : null}
              </VStack>
            </Button>
          );
          return labels ? (
            button
          ) : (
            <LabelPeek
              key={item.key}
              label={label}
              symbol={symbolFor(item)}
              shown={peek === item.key}
              onDismiss={() => setPeek(undefined)}
            >
              {button}
            </LabelPeek>
          );
        })}
      </HStack>
    </Host>
  );
}

function LabelPeek({
  label,
  symbol,
  shown,
  onDismiss,
  children,
}: {
  label: string;
  symbol: TabSymbol;
  shown: boolean;
  onDismiss(): void;
  children: ReactNode;
}) {
  return (
    <Popover
      isPresented={shown}
      onIsPresentedChange={(presented) => {
        if (!presented) onDismiss();
      }}
      attachmentAnchor="top"
      arrowEdge="bottom"
      modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}
    >
      <Popover.Trigger>{children}</Popover.Trigger>
      <Popover.Content>
        <VStack
          spacing={space.x3}
          modifiers={[
            padding({ all: space.x5 }),
            accessibilityElement('ignore'),
            accessibilityLabel(label),
          ]}
        >
          <Image
            systemName={symbol}
            modifiers={[font({ textStyle: 'largeTitle' }), accessibilityHidden(true)]}
          />
          <Text modifiers={[font({ textStyle: 'title2', weight: 'semibold' })]}>{label}</Text>
        </VStack>
      </Popover.Content>
    </Popover>
  );
}
