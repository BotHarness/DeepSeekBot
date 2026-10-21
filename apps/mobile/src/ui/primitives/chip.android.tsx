import { FilterChip, Host, Text as ComposeText } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';

export function Chip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <View style={{ minHeight: theme.touch, justifyContent: 'center' }}>
      <Host colorScheme={theme.scheme} seedColor={theme.color.accent} matchContents>
        <FilterChip
          selected={selected}
          onClick={onPress}
          border={{ color: selected ? theme.color.accent : theme.color.muted }}
          colors={{
            containerColor: 'transparent',
            labelColor: theme.color.fg,
            selectedContainerColor: theme.layer.canvas.chosen,
            selectedLabelColor: theme.color.fg,
          }}
        >
          <FilterChip.Label>
            <ComposeText>{count === undefined ? label : `${label}  ${count}`}</ComposeText>
          </FilterChip.Label>
        </FilterChip>
      </Host>
    </View>
  );
}
