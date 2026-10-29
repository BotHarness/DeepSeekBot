import { Host, Toggle } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityLabel,
  controlSize,
  disabled as disabledModifier,
  frame,
  tint,
  toggleStyle,
} from '@expo/ui/swift-ui/modifiers';

import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import type { ChipProps } from './chip';

export function Chip({ label, testID, count, selected, onPress, disabled = false }: ChipProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <Host matchContents colorScheme={theme.scheme}>
      <Toggle
        label={count === undefined ? label : `${label}  ${count}`}
        isOn={selected}
        onIsOnChange={() => {
          if (!disabled) onPress();
        }}
        {...(testID ? { testID } : {})}
        modifiers={[
          toggleStyle('button'),
          controlSize('regular'),
          tint(theme.color.accent),
          disabledModifier(disabled),
          frame({ minHeight: theme.touch }),
          accessibilityLabel(count === undefined ? label : t.filterChip(label, count)),
          ...(selected ? [accessibilityAddTraits(['isSelected'])] : []),
        ]}
      />
    </Host>
  );
}
