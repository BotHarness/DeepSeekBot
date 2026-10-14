import { ActivityIndicator, Pressable } from 'react-native';

import { buttonColors, type ButtonTone } from '../design/controls';
import type { LayerName } from '../design/layers';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from './text';

export type { ButtonTone } from '../design/controls';

export function Button({
  label,
  onPress,
  tone = 'secondary',
  disabled = false,
  busy = false,
  on = 'raised',
}: {
  label: string;
  onPress(): void;
  tone?: ButtonTone;
  disabled?: boolean;
  busy?: boolean;
  on?: LayerName;
}) {
  const theme = useDesignTheme();
  const colors = buttonColors(theme, tone, on);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: 'stretch',
        minHeight: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.x5,
        borderRadius: radius.round,
        backgroundColor: pressed ? colors.pressed : colors.fill,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color={colors.label} />
      ) : (
        <Text strong numberOfLines={1} style={{ color: colors.label }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
