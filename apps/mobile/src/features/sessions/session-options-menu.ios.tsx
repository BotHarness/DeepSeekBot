import { Button, Host, Image, Menu, Section } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityIdentifier,
  accessibilityLabel,
  buttonStyle,
  dynamicTypeSize,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';
import { useDesignTheme } from '../../ui/design/theme';
import { useStrings } from '../../ui/strings';
import type { SessionOptionsMenuProps } from './session-options-menu';

export function SessionOptionsMenu({ active, groups }: SessionOptionsMenuProps) {
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const glass = Number.parseInt(String(Platform.Version), 10) >= 26;
  return (
    <Host key={theme.scheme} colorScheme={theme.scheme} matchContents>
      <Menu
        label={
          <Image
            systemName="line.3.horizontal.decrease"
            modifiers={[
              font({ textStyle: 'body', weight: 'medium' }),
              dynamicTypeSize({ max: 'xxxLarge' }),
              foregroundStyle(active ? theme.color.accent : theme.color.fg),
              frame({ width: theme.touch, height: theme.touch }),
            ]}
          />
        }
        modifiers={[
          buttonStyle('plain'),
          tint(theme.color.fg),
          ...(glass
            ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'circle' })]
            : []),
          accessibilityLabel(t.options),
          accessibilityAddTraits(active ? ['isSelected'] : []),
          accessibilityIdentifier('session-drawer-options'),
        ]}
      >
        {groups.map((group) => (
          <Section key={group.id} title={group.label}>
            {group.choices.map((choice) => (
              <Button
                key={choice.id}
                label={choice.label}
                {...(choice.id === group.selected ? { systemImage: 'checkmark' } : {})}
                onPress={choice.select}
              />
            ))}
          </Section>
        ))}
      </Menu>
    </Host>
  );
}
