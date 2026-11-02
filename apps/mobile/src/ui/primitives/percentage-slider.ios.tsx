import { Host, Slider } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  accessibilityValue,
  labelsHidden,
  tint,
} from '@expo/ui/swift-ui/modifiers';

import { useDesignTheme } from '../design/theme';
import type { PercentageSliderProps } from './percentage-slider';

export function PercentageSlider({ label, value, onChange }: PercentageSliderProps) {
  const theme = useDesignTheme();
  return (
    <Host
      colorScheme={theme.scheme}
      matchContents={{ vertical: true }}
      style={{ alignSelf: 'stretch', minHeight: theme.touch }}
    >
      <Slider
        value={value}
        min={0}
        max={100}
        step={1}
        onValueChange={(next) => {
          const rounded = Math.round(next);
          if (rounded !== value) onChange(rounded);
        }}
        modifiers={[
          tint(theme.color.accent),
          labelsHidden(),
          accessibilityLabel(label),
          accessibilityValue(`${value}%`),
        ]}
      />
    </Host>
  );
}
