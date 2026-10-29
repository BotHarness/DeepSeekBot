import { Host, HStack, Image, Menu, Picker, Text } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  buttonStyle,
  fixedSize,
  font,
  frame,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import type { EnvironmentPickerProps } from './environment-picker';

export function EnvironmentPicker({
  label,
  placeholder,
  value,
  options,
  onChange,
}: EnvironmentPickerProps) {
  const theme = useDesignTheme();
  const selected = options.find((option) => option.value === value)?.label ?? placeholder;
  return (
    <Host
      colorScheme={theme.scheme}
      matchContents={{ vertical: true }}
      ignoreSafeArea="keyboard"
      style={{ alignSelf: 'stretch', minHeight: theme.touch }}
    >
      <Menu
        testID="create-bot-environment"
        modifiers={[
          buttonStyle('plain'),
          frame({ maxWidth: Infinity, minHeight: theme.touch, alignment: 'leading' }),
          accessibilityElement('ignore'),
          accessibilityLabel(`${label}, ${selected}`),
        ]}
        label={
          <HStack>
            <Text
              modifiers={[
                font({ textStyle: 'body' }),
                fixedSize({ horizontal: false, vertical: true }),
                frame({ maxWidth: Infinity, alignment: 'leading' }),
              ]}
            >
              {selected}
            </Text>
            <Image systemName="chevron.down" modifiers={[font({ textStyle: 'body' })]} />
          </HStack>
        }
      >
        <Picker selection={value} onSelectionChange={onChange} modifiers={[pickerStyle('inline')]}>
          <Text modifiers={[tag('')]}>{placeholder}</Text>
          {options.map((option) => (
            <Text key={option.value} modifiers={[tag(option.value)]}>
              {option.label}
            </Text>
          ))}
        </Picker>
      </Menu>
    </Host>
  );
}
