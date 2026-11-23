import { Host, Picker, Text } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  disabled as disabledModifier,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';

import { useDesignTheme } from '../design/theme';
import { segmentTestID, type SegmentedProps } from './segmented';

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  testID,
}: SegmentedProps<T>) {
  const theme = useDesignTheme();
  return (
    <Host
      key={theme.scheme}
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      style={{ alignSelf: 'stretch' }}
    >
      <Picker<T>
        selection={value}
        onSelectionChange={(next) => {
          if (!disabled && next !== value) Promise.resolve(onChange(next)).catch(() => undefined);
        }}
        modifiers={[
          disabledModifier(disabled),
          pickerStyle('segmented'),
          accessibilityLabel(label),
        ]}
      >
        {options.map((option) => (
          <Text
            key={option.value}
            modifiers={[
              tag(option.value),
              ...(testID === undefined
                ? []
                : [accessibilityIdentifier(segmentTestID(testID, option.value)!)]),
            ]}
          >
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
