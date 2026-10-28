import { Host } from '@expo/ui';
import { Slider } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  accessibilityValue,
  labelsHidden,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import type { AvatarRangeProps } from './avatar-range';

export function AvatarRange({ label, value, min, max, onChange }: AvatarRangeProps) {
  const theme = useDesignTheme();
  return (
    <Host
      colorScheme={theme.scheme}
      matchContents={{ vertical: true }}
      style={{ alignSelf: 'stretch', minHeight: theme.touch }}
    >
      <Slider
        value={value}
        min={min}
        max={max}
        step={1}
        onValueChange={(next) => onChange(Math.round(next))}
        modifiers={[
          tint(theme.color.accent),
          labelsHidden(),
          accessibilityLabel(label),
          accessibilityValue(String(value)),
        ]}
      />
    </Host>
  );
}
