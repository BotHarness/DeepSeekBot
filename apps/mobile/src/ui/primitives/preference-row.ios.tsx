import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import type { PreferenceRowProps } from './preference-row';

export function PreferenceRow<T extends string>({
  title,
  testID,
  value,
  options,
  onChange,
}: PreferenceRowProps<T>) {
  const theme = useDesignTheme();
  return (
    <Host
      colorScheme={theme.scheme}
      matchContents={{ vertical: true }}
      style={{ minHeight: theme.touch, paddingHorizontal: space.x5, paddingVertical: space.x3 }}
    >
      <Picker<T>
        label={title}
        selection={value}
        onSelectionChange={onChange}
        testID={testID}
        modifiers={[pickerStyle('menu'), accessibilityLabel(title)]}
      >
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
