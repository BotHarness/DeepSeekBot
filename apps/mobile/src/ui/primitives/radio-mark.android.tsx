import { Host, RadioButton } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';

export function RadioMark({ selected }: { selected: boolean }) {
  const theme = useDesignTheme();
  return (
    <View importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Host colorScheme={theme.scheme} seedColor={theme.color.accent} matchContents>
        <RadioButton
          selected={selected}
          colors={{ selectedColor: theme.color.accent, unselectedColor: theme.color.muted }}
        />
      </Host>
    </View>
  );
}
