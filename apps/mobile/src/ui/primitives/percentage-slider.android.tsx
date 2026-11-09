import { Host, Slider } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

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
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value, text: `${value}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) =>
        onChange(
          percentageStep(
            value + (event.nativeEvent.actionName === 'increment' ? 5 : -5),
            step,
            max,
          ),
        )
      }
      style={{ minHeight: theme.touch, justifyContent: 'center' }}
    >
      <View importantForAccessibility="no-hide-descendants">
        <Host
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
          matchContents={{ vertical: true }}
          style={{ width: '100%' }}
        >
          <Slider
            value={value}
            min={0}
            max={max}
            onValueChange={(next) => {
              const rounded = percentageStep(next, step, max);
              if (rounded !== value) onChange(rounded);
            }}
            colors={{
              thumbColor: theme.color.accent,
              activeTrackColor: theme.color.accent,
              inactiveTrackColor: theme.layer.raised.inset,
            }}
          />
        </Host>
      </View>
    </View>
  );
}
