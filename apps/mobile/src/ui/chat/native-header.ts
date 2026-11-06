import { useHeaderHeight } from 'expo-router/react-navigation';
import { Platform, PlatformColor, type TextProps, type TextStyle } from 'react-native';

import { floatingHeader, glassHeader } from './header-kind';
import type { DesignTheme } from '../design/theme';
import { space } from '../design/tokens';

export { floatingHeader, glassHeader, headerIslands } from './header-kind';

export function useHeaderOverlap(): number {
  const height = useHeaderHeight();
  return Platform.OS === 'ios' ? height : 0;
}

export function useHeaderPadding(): number {
  const height = useHeaderHeight();
  return floatingHeader ? height : 0;
}

export const barLabelStyle: TextStyle = glassHeader ? { color: PlatformColor('label') } : {};

export const barLabelProps: Pick<TextProps, 'maxFontSizeMultiplier'> =
  Platform.OS === 'ios' ? { maxFontSizeMultiplier: 1.35 } : {};

export function headerControlHeight(theme: DesignTheme): number {
  const lines =
    (theme.type.body.line + theme.type.meta.line) *
    Math.min(theme.fontScale, barLabelProps.maxFontSizeMultiplier ?? Infinity);
  return Math.max(theme.touch, glassHeader ? Math.ceil(lines) + space.x2 : lines);
}
