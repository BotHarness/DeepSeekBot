import { requireNativeView } from 'expo';
import { View, type ViewProps } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useDesignTheme } from '../design/theme';
import { useSelectionFeedback } from '../selection-feedback';
import type { IconTabsProps } from './icon-tabs';

type NativeButtonGroupProps = ViewProps & {
  items: { value: string; label: string; path: string }[];
  selected: string;
  dark: boolean;
  foreground: string;
  container: string;
  checkedContainer: string;
  checkedForeground: string;
  reduceMotion: boolean;
  onSelect(event: { nativeEvent: { value: string } }): void;
};

const NativeButtonGroup = requireNativeView<NativeButtonGroupProps>('MaterialButtonGroup');

export function IconTabs<T extends string>({
  label,
  options,
  value,
  on = 'canvas',
  onChange,
}: IconTabsProps<T>) {
  const theme = useDesignTheme();
  const reduced = useReducedMotion();
  const layer = theme.layer[on];
  const select = useSelectionFeedback(value, onChange);
  return (
    <View accessibilityLabel={label} style={{ minHeight: theme.touch }}>
      <NativeButtonGroup
        testID="profile-tabs"
        style={{ width: '100%', height: theme.touch }}
        items={options.map((option) => ({
          value: option.value,
          label: option.label,
          path: option.path,
        }))}
        selected={value}
        dark={theme.scheme === 'dark'}
        foreground={theme.color.fg}
        container={layer.inset}
        checkedContainer={theme.color.accent}
        checkedForeground={theme.color.onAccent}
        reduceMotion={reduced}
        onSelect={(event) => {
          const next = options.find((option) => option.value === event.nativeEvent.value);
          if (next !== undefined) select(next.value);
        }}
      />
    </View>
  );
}
