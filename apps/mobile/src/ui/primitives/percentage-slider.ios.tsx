import { Host, Slider } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  accessibilityValue,
  labelsHidden,
  tint,
} from '@expo/ui/swift-ui/modifiers';

import { useDesignTheme } from '../design/theme';
import type { PercentageSliderProps } from './percentage-slider';
import { percentageStep } from './percentage-step';

export function PercentageSlider({
  label,
  value,
  max = 100,
  step = 1,
  onChange,
}: PercentageSliderProps) {
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
        max={max}
        step={step}
        onValueChange={(next) => {
          const rounded = percentageStep(next, step, max);
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
