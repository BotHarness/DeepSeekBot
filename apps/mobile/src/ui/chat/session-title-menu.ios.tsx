import { Host } from '@expo/ui';
import { Button, HStack, Menu, Section, Spacer, Text } from '@expo/ui/swift-ui';
import {
  accessibilityHint,
  background,
  clipShape,
  accessibilityIdentifier,
  accessibilityLabel,
  buttonStyle,
  disabled,
  dynamicTypeSize,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  lineLimit,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { MENU_SYMBOL } from '../primitives/menu-symbols';
import { controlCase } from '../platform-copy';
import { ChatTitleCapsule } from './chat-title-capsule';
import { glassHeader } from './header-kind';
import { headerControlHeight } from './native-header';
import type { SessionTitleMenuProps } from './session-title-menu';

export function SessionTitleMenu({ title, hint, menu }: SessionTitleMenuProps) {
  const theme = useDesignTheme();
  const height = headerControlHeight(theme);
  if (menu === undefined)
    return (
      <ChatTitleCapsule
        title={title}
        kind="heading"
        accessibilityLabel={title}
        testID="session-header-title"
      />
    );
  return (
    <Host colorScheme={theme.scheme} style={{ width: '100%', height }}>
      <Menu
        label={
          <HStack
            spacing={0}
            modifiers={[frame({ height }), padding({ horizontal: theme.touch / 2 })]}
          >
            <Text
              modifiers={[
                font({ textStyle: 'body', weight: 'semibold' }),
                dynamicTypeSize({ max: 'xxxLarge' }),
                lineLimit(1),
                foregroundStyle(theme.color.fg),
              ]}
            >
              {title}
            </Text>
            <Spacer />
          </HStack>
        }
        modifiers={[
          buttonStyle('plain'),
          tint(theme.color.fg),
          ...(glassHeader
            ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' })]
            : [background(theme.layer.raised.fill), clipShape('capsule')]),
          accessibilityLabel(title),
          accessibilityHint(hint),
          accessibilityIdentifier('session-header-title'),
        ]}
      >
        <Section title={title}>
          {menu.items.map((item) => (
            <Button
              key={item.testID}
              testID={item.testID}
              label={controlCase(item.label)}
              systemImage={MENU_SYMBOL[item.icon]}
              {...(item.destructive ? { role: 'destructive' as const } : {})}
              modifiers={[disabled(item.disabled === true)]}
              onPress={item.run}
            />
          ))}
        </Section>
      </Menu>
    </Host>
  );
}
