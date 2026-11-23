import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';

export function CreationRow({
  label,
  icon,
  testID,
  onPress,
  onBack,
  focusRef,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  testID: string;
  onPress(): void;
  onBack?: (() => void) | undefined;
  focusRef?: React.Ref<React.ComponentRef<typeof Pressable>> | undefined;
  disabled?: boolean;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      ref={focusRef}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onAccessibilityEscape={onBack}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: pressTint(theme.color.fg) }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        padding: space.x3,
        gap: space.x3,
        borderRadius: radius.lg,
        backgroundColor: pressed ? theme.layer.raised.pressed : undefined,
      })}
    >
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text>{label}</Text>
      </View>
    </Pressable>
  );
}
