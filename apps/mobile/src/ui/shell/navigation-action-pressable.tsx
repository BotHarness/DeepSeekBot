import type { ComponentRef, Ref } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { clampScaledIconSize } from '../design/scaled-icon-size';
import { pressTint, useDesignTheme, type DesignTheme } from '../design/theme';
import { fab, radius } from '../design/tokens';
import { CloseIcon, PlusIcon } from './icons';
import { NavigationMaterial } from './navigation-material';

export type NavigationActionProps = {
  size: number;
  label: string;
  close?: boolean;
  ref?: Ref<ComponentRef<typeof Pressable>>;
  disabled?: boolean;
  expanded?: boolean;
  testID?: string;
  onPress(): void;
};

export function fabGlyphSize(theme: DesignTheme): number {
  const size = theme.type.title.line;
  return Platform.OS === 'android'
    ? size
    : clampScaledIconSize(size, theme.fontScale, size * fab.glyphMaxScale);
}

export function NavigationActionPressable({
  size,
  label,
  close = false,
  ref,
  disabled = false,
  expanded,
  testID,
  onPress,
}: NavigationActionProps) {
  const theme = useDesignTheme();
  const androidFab = !close && Platform.OS === 'android';
  const Icon = close ? CloseIcon : PlusIcon;
  const target = Math.max(size, theme.touch);
  const unavailable = disabled || expanded === true;
  const button = (
    <Pressable
      ref={ref}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable, expanded }}
      disabled={unavailable}
      onPress={onPress}
      android_ripple={{ color: pressTint(androidFab ? theme.color.accent : theme.color.fg) }}
      style={({ pressed }) => ({
        width: target,
        height: target,
        borderRadius: androidFab ? fab.radius : radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: androidFab ? fab.elevation : undefined,
        backgroundColor: androidFab
          ? theme.layer.raised.chosen
          : close && pressed
            ? theme.layer.raised.pressed
            : 'transparent',
        opacity: expanded ? 0 : !close && pressed ? 0.7 : 1,
      })}
    >
      {!close && !androidFab ? <NavigationMaterial circle /> : null}
      <Icon color={theme.color.fg} size={close ? theme.type.title.line : fabGlyphSize(theme)} />
    </Pressable>
  );
  return close ? (
    <View style={{ width: target, height: target, borderRadius: radius.round, overflow: 'hidden' }}>
      <NavigationMaterial circle />
      {button}
    </View>
  ) : (
    button
  );
}
