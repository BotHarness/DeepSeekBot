import { Host, Slider } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';

export function PercentageSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
}) {
  const theme = useDesignTheme();
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: value, text: `${value}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) =>
        onChange(
          Math.max(
            0,
            Math.min(100, value + (event.nativeEvent.actionName === 'increment' ? 5 : -5)),
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
            max={100}
            onValueChange={(next) => onChange(Math.round(next))}
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
