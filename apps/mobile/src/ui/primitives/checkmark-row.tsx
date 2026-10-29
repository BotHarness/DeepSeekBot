import { Pressable, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { CheckIcon } from '../shell/icons';
import { Text } from './text';

export interface CheckmarkRowProps {
  label: string;
  selected: boolean;
  onPress(): void;
  disabled?: boolean | undefined;
  testID?: string | undefined;
}

export function CheckmarkRow({
  label,
  selected,
  onPress,
  disabled = false,
  testID,
}: CheckmarkRowProps) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text tone={disabled ? 'muted' : 'fg'} style={{ flex: 1 }}>
        {label}
      </Text>
      <View style={{ width: theme.type.body.line, alignItems: 'center' }}>
        {selected ? <CheckIcon color={theme.color.accent} size={theme.type.body.line} /> : null}
      </View>
    </Pressable>
  );
}
