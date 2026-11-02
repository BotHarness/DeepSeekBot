import { Host, Slider } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import type { AvatarRangeProps } from './avatar-range';

export function AvatarRange({ label, value, min, max, onChange }: AvatarRangeProps) {
  const theme = useDesignTheme();
  return (
    <View
      style={{ minHeight: theme.touch }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) =>
        onChange(
          Math.max(
            min,
            Math.min(max, value + (event.nativeEvent.actionName === 'increment' ? 1 : -1)),
          ),
        )
      }
    >
      <View importantForAccessibility="no-hide-descendants">
        <Host
          matchContents={{ vertical: true }}
          ignoreSafeAreaKeyboardInsets
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
          style={{ width: '100%' }}
        >
          <Slider
            value={value}
            min={min}
            max={max}
            steps={max - min - 1}
            onValueChange={(next) => onChange(Math.round(next))}
          />
        </Host>
      </View>
    </View>
  );
}
