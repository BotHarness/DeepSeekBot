import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
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
  return (
    <Host
      colorScheme={theme.scheme}
      matchContents={{ vertical: true }}
      style={{ minHeight: theme.touch }}
    >
      <Picker
        selection={value}
        onSelectionChange={onChange}
        testID="create-bot-environment"
        modifiers={[pickerStyle('menu'), accessibilityLabel(label)]}
      >
        <Text modifiers={[tag('')]}>{placeholder}</Text>
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
