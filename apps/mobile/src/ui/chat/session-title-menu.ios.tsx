import { Host } from '@expo/ui';
import { Button, HStack, Menu, Section, Spacer, Text } from '@expo/ui/swift-ui';
import {
  Animation,
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityHint,
  animation,
  background,
  clipShape,
  contentTransition,
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
import { useReducedMotion } from 'react-native-reanimated';
import { useDesignTheme } from '../design/theme';
import { MENU_SYMBOL } from '../primitives/menu-symbols';
import { controlCase } from '../platform-copy';
import { glassHeader } from './header-kind';
import { headerControlHeight } from './native-header';
import { titleMorphKey } from './session-header-title';
import type { SessionTitleMenuProps } from './session-title-menu';

export function SessionTitleMenu({ title, pending = false, hint, menu }: SessionTitleMenuProps) {
  const theme = useDesignTheme();
  const reducedMotion = useReducedMotion();
  const height = headerControlHeight(theme);
  const capsule = glassHeader
    ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' })]
    : [background(theme.layer.raised.fill), clipShape('capsule')];
  const label = (
    <HStack
      spacing={0}
      modifiers={[
        frame({ height }),
        padding({ horizontal: theme.touch / 2 }),
        ...(reducedMotion ? [] : [animation(Animation.smooth(), titleMorphKey(title, pending))]),
      ]}
    >
      <Text
        modifiers={[
          font({ textStyle: 'body', weight: 'semibold' }),
          dynamicTypeSize({ max: 'xxxLarge' }),
          lineLimit(1),
          foregroundStyle(pending ? theme.color.muted : theme.color.fg),
          contentTransition(reducedMotion ? 'identity' : 'interpolate'),
        ]}
      >
        {title}
      </Text>
      <Spacer />
    </HStack>
  );
  if (menu === undefined)
    return (
      <Host colorScheme={theme.scheme} style={{ width: '100%', height }}>
        <HStack
          spacing={0}
          modifiers={[
            ...capsule,
            accessibilityElement('ignore'),
            accessibilityLabel(title),
            accessibilityAddTraits(['isHeader']),
            accessibilityIdentifier('session-header-title'),
          ]}
        >
          {label}
        </HStack>
      </Host>
    );
  return (
    <Host colorScheme={theme.scheme} style={{ width: '100%', height }}>
      <Menu
        label={label}
        modifiers={[
          buttonStyle('plain'),
          tint(theme.color.fg),
          ...capsule,
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
