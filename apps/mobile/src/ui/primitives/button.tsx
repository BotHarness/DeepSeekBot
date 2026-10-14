import { ActivityIndicator, Pressable } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from './text';

export type ButtonTone = 'primary' | 'secondary' | 'danger';

export function Button({
  label,
  onPress,
  tone = 'secondary',
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress(): void;
  tone?: ButtonTone;
  disabled?: boolean;
  busy?: boolean;
}) {
  const theme = useDesignTheme();
  const filled = tone === 'primary';
  const ink = filled ? 'onAccent' : tone === 'danger' ? 'danger' : 'fg';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.x5,
        borderRadius: radius.md,
        backgroundColor: filled ? theme.color.accent : pressed ? theme.color.hover : undefined,
        borderWidth: filled ? 0 : edge.hairline,
        borderColor: theme.color.borderStrong,
        opacity: disabled ? 0.45 : filled && pressed ? 0.7 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color={theme.color[ink]} />
      ) : (
        <Text strong tone={ink} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
