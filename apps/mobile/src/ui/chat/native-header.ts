import { useHeaderHeight } from 'expo-router/react-navigation';
import { Platform, PlatformColor, type TextStyle } from 'react-native';

import { floatingHeader } from './header-kind';

export { floatingHeader, glassHeader, headerIslands } from './header-kind';

export function useHeaderOverlap(): number {
  const height = useHeaderHeight();
  return Platform.OS === 'ios' ? height : 0;
}

export function useHeaderPadding(): number {
  const height = useHeaderHeight();
  return floatingHeader ? height : 0;
}

export const barLabelStyle: TextStyle =
  Platform.OS === 'ios' ? { color: PlatformColor('label') } : {};
