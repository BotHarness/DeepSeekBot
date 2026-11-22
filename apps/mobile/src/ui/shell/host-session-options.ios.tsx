import { Host, Image, Menu, Picker, Section, Text } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityIdentifier,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  dynamicTypeSize,
  font,
  foregroundStyle,
  frame,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import type {
  HostSessionOptionsButtonProps,
  HostSessionOptionsSheetProps,
} from './host-session-options';

export function HostSessionOptionsButton({ active, groups }: HostSessionOptionsButtonProps) {
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const glass = Number.parseInt(String(Platform.Version), 10) >= 26;
  return (
    <Host
      key={theme.scheme}
      colorScheme={theme.scheme}
      style={{ width: theme.touch, height: theme.touch }}
    >
      <Menu
        modifiers={[
          buttonStyle(glass ? 'glass' : 'borderless'),
          buttonBorderShape('circle'),
          accessibilityLabel(t.options),
          accessibilityIdentifier('host-sessions-options'),
          accessibilityAddTraits(active ? ['isSelected'] : []),
        ]}
        label={
          <Image
            systemName="line.3.horizontal.decrease"
            modifiers={[
              font({ textStyle: 'body', weight: 'medium' }),
              dynamicTypeSize({ max: 'xxxLarge' }),
              foregroundStyle(active ? theme.color.accent : theme.color.fg),
              frame({ width: theme.type.body.line, height: theme.type.body.line }),
            ]}
          />
        }
      >
        {groups.map((group) => (
          <Section key={group.id} title={group.label}>
            <Picker
              selection={group.selected}
              onSelectionChange={(id) => group.choices.find((choice) => choice.id === id)?.select()}
              modifiers={[pickerStyle('inline')]}
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

export function HostSessionOptionsSheet(_props: HostSessionOptionsSheetProps) {
  return null;
}
