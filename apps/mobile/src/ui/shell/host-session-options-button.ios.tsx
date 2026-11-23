import { Host, Image, Menu, Picker, Section, Text } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  buttonStyle,
  foregroundStyle,
  frame,
  glassEffect,
  menuIndicator,
  menuOrder,
  menuStyle,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import type { HostSessionOptionsButtonProps } from './host-session-options-button';

export function HostSessionOptionsButton({ active, groups }: HostSessionOptionsButtonProps) {
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const glass = Number.parseInt(String(Platform.Version), 10) >= 26;
  return (
    <Host colorScheme={theme.scheme} style={{ width: theme.touch, height: theme.touch }}>
      <Menu
        label={
          <Image
            systemName="line.3.horizontal.decrease"
            size={theme.type.title.size}
            modifiers={[
              foregroundStyle(active ? theme.color.accent : theme.color.fg),
              frame({ width: theme.touch, height: theme.touch }),
            ]}
          />
        }
        modifiers={[
          accessibilityIdentifier('host-sessions-options'),
          accessibilityLabel(t.options),
          menuStyle('button'),
          buttonStyle('plain'),
          menuIndicator('hidden'),
          menuOrder('fixed'),
          ...(glass
            ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'circle' })]
            : []),
        ]}
      >
        {groups.map((group) => (
          <Section key={group.id} title={group.label}>
            <Picker
              label={group.label}
              selection={group.selected}
              modifiers={[pickerStyle('inline')]}
              onSelectionChange={(id) => group.choices.find((choice) => choice.id === id)?.select()}
            >
              {group.choices.map((choice) => (
                <Text key={choice.id} modifiers={[tag(choice.id)]}>
                  {choice.label}
                </Text>
              ))}
            </Picker>
          </Section>
        ))}
      </Menu>
    </Host>
  );
}
