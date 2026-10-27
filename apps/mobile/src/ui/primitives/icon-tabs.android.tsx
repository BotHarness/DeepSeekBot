import { Host, type PrimitiveBaseProps } from '@expo/ui/jetpack-compose';
import { testID } from '@expo/ui/jetpack-compose/modifiers';
import { requireNativeView } from 'expo';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useDesignTheme } from '../design/theme';
import { useSelectionFeedback } from '../selection-feedback';
import type { IconTabsProps } from './icon-tabs';

type NativeButtonGroupProps = PrimitiveBaseProps & {
  items: { value: string; label: string; path: string }[];
  selected: string;
  reduceMotion: boolean;
  onSelect(event: { nativeEvent: { value: string } }): void;
};

const NativeButtonGroup = requireNativeView<NativeButtonGroupProps>(
  'MaterialButtonGroup',
  'MaterialButtonGroupView',
);

export function IconTabs<T extends string>({ label, options, value, onChange }: IconTabsProps<T>) {
  const theme = useDesignTheme();
  const reduced = useReducedMotion();
  const select = useSelectionFeedback(value, onChange);
  return (
    <View accessibilityLabel={label} style={{ minHeight: theme.touch }}>
      <Host
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        style={{ width: '100%', height: theme.touch }}
      >
        <NativeButtonGroup
          modifiers={[testID('profile-tabs')]}
          items={options.map((option) => ({
            value: option.value,
            label: option.label,
            path: option.path,
          }))}
          selected={value}
          reduceMotion={reduced}
          onSelect={(event) => {
            const next = options.find((option) => option.value === event.nativeEvent.value);
            if (next !== undefined) select(next.value);
          }}
        />
      </Host>
    </View>
  );
}
