import { FilterChip, Host, Text as ComposeText } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';

export function Chip({
  label,
  testID,
  count,
  selected,
  onPress,
}: {
  label: string;
  testID?: string;
  count?: number;
  selected: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <View testID={testID} style={{ minHeight: theme.touch, justifyContent: 'center' }}>
      <Host colorScheme={theme.scheme} seedColor={theme.color.accent} matchContents>
        <FilterChip
          selected={selected}
          onClick={onPress}
          border={{ width: 0, color: 'transparent' }}
          colors={{
            containerColor: theme.layer.canvas.inset,
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
