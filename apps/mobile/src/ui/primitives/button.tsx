import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { buttonColors, type ButtonTone } from '../design/controls';
import type { LayerName } from '../design/layers';
import { pressTint, useDesignTheme } from '../design/theme';
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
  variant = 'filled',
  icon,
}: {
  label: string;
  onPress(): void;
  tone?: ButtonTone;
  disabled?: boolean;
  busy?: boolean;
  on?: LayerName;
  variant?: 'filled' | 'text';
  icon?: ReactNode;
}) {
  const theme = useDesignTheme();
  const colors = buttonColors(theme, tone, on);
  const filled = variant === 'filled';
  const labelColor = filled
    ? colors.label
    : tone === 'danger'
      ? theme.color.danger
      : theme.color.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      android_ripple={{ color: pressTint(labelColor) }}
      style={({ pressed }) => ({
        alignSelf: 'stretch',
        minHeight: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: space.x3,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        borderRadius: radius.round,
        backgroundColor: pressed ? colors.pressed : filled ? colors.fill : undefined,
        overflow: 'hidden',
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <>
          {icon === undefined ? null : (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {icon}
            </View>
          )}
          <Text strong style={{ color: labelColor, textAlign: 'center', flexShrink: 1 }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
