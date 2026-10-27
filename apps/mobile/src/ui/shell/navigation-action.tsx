import { Pressable, View } from 'react-native';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius } from '../design/tokens';
import { NavigationMaterial } from './navigation-material';
import { BackIcon } from './back-icon';
import { CloseIcon, PlusIcon } from './icons';

export type NavigationActionProps = {
  size: number;
  label: string;
  close?: boolean;
  back?: boolean;
  onPress(): void;
};
export function NavigationAction({
  size,
  label,
  close = false,
  back = false,
  onPress,
}: NavigationActionProps) {
  const theme = useDesignTheme();
  const Icon = back ? BackIcon : close ? CloseIcon : PlusIcon;
  return (
    <View style={{ width: size, height: size, borderRadius: radius.round, overflow: 'hidden' }}>
      <NavigationMaterial circle />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        android_ripple={{ color: pressTint(theme.color.fg) }}
        style={({ pressed }) => ({
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? theme.layer.raised.pressed : 'transparent',
        })}
      >
        <Icon color={theme.color.fg} size={theme.type.title.line} />
      </Pressable>
    </View>
  );
}
