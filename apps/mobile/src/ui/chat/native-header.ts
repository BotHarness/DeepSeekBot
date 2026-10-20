import { useHeaderHeight } from 'expo-router/react-navigation';
import { Platform, PlatformColor, type TextStyle } from 'react-native';

export const glassHeader =
  Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26;

export function useHeaderOverlap(): number {
  const height = useHeaderHeight();
  return Platform.OS === 'ios' ? height : 0;
}

export const floatingHeader = Platform.OS === 'android';

export function useHeaderPadding(): number {
  const height = useHeaderHeight();
  return floatingHeader ? height : 0;
}

export const barLabelStyle: TextStyle =
  Platform.OS === 'ios' ? { color: PlatformColor('label') } : {};
