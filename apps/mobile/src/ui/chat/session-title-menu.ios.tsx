import { Host } from '@expo/ui';
import { Button, HStack, Image, Menu, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { HOST_SYMBOLS } from '@botharness/host-client/ui/design/host-look';
import {
  Animation,
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityHint,
  animation,
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
  truncationMode,
} from '@expo/ui/swift-ui/modifiers';
import { useReducedMotion } from 'react-native-reanimated';
import { useDesignTheme } from '../design/theme';
import { MENU_SYMBOL } from '../primitives/menu-symbols';
import { controlCase } from '../platform-copy';
import { glassHeader } from './header-kind';
import { headerControlHeight } from './native-header';
import { titleMorphKey } from './session-header-title';
import { sessionMenuHeader, sessionPlaceLabel, type SessionPlace } from './session-place';
import { radius, space } from '../design/tokens';
import { titleChipFill } from './header-chrome';
import type { SessionTitleMenuProps } from './session-title-menu';

export function SessionTitleMenu({
  title,
  pending = false,
  place,
  hint,
  menu,
}: SessionTitleMenuProps) {
  const theme = useDesignTheme();
  const reducedMotion = useReducedMotion();
  const height = headerControlHeight(theme);
  const capsule = glassHeader
    ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' })]
    : [];
  const hostStyle = {
    width: '100%' as const,
    height,
    borderRadius: radius.round,
    ...titleChipFill(theme, false),
  };
  const label = (
    <HStack
      spacing={0}
      modifiers={[
        frame({ height }),
        padding({ horizontal: theme.touch / 2 }),
        ...(reducedMotion ? [] : [animation(Animation.smooth(), titleMorphKey(title, pending))]),
      ]}
    >
      <VStack alignment="leading" spacing={0}>
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
        {place === undefined ? null : <PlaceLine place={place} />}
      </VStack>
      <Spacer />
    </HStack>
  );
  if (menu === undefined)
    return (
      <Host colorScheme={theme.scheme} style={hostStyle}>
        <HStack
          spacing={0}
          modifiers={[
            ...capsule,
            accessibilityElement('ignore'),
            accessibilityLabel(sessionPlaceLabel(title, place)),
            accessibilityAddTraits(['isHeader']),
            accessibilityIdentifier('session-header-title'),
          ]}
        >
          {label}
        </HStack>
      </Host>
    );
  return (
    <Host colorScheme={theme.scheme} style={hostStyle}>
      <Menu
        label={label}
        modifiers={[
          buttonStyle('plain'),
          tint(theme.color.fg),
          ...capsule,
          accessibilityLabel(sessionPlaceLabel(title, place)),
          accessibilityHint(hint),
          accessibilityIdentifier('session-header-title'),
        ]}
      >
        <Section title={sessionMenuHeader(title, place)}>
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

function PlaceLine({ place }: { place: SessionPlace }) {
  const theme = useDesignTheme();
  const meta = [
    font({ textStyle: 'footnote' }),
    dynamicTypeSize({ max: 'xxxLarge' }),
    foregroundStyle(theme.color.muted),
  ];
  return (
    <HStack spacing={space.x3}>
      {place.hostIcon.kind === 'symbol' ? (
        <Image systemName={HOST_SYMBOLS[place.hostIcon.id].ios as never} modifiers={meta} />
      ) : (
        <Text modifiers={meta}>{place.hostIcon.emoji}</Text>
      )}
      {place.folder === undefined ? null : (
        <HStack spacing={space.x2}>
          <Image systemName="folder" modifiers={meta} />
          <Text modifiers={[...meta, lineLimit(1), truncationMode('middle')]}>{place.folder}</Text>
        </HStack>
      )}
    </HStack>
  );
}
