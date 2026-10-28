import { useProfilePaging } from './profile-paging';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { Platform, PlatformColor, type TextStyle } from 'react-native';

import { floatingHeader, glassHeader } from './header-kind';

export { floatingHeader, glassHeader, headerIslands } from './header-kind';

export function useHeaderOverlap(): number {
  const height = useHeaderHeight();
  const paging = useProfilePaging();
  return paging !== undefined ? 0 : Platform.OS === 'ios' ? height : 0;
}

export function useHeaderPadding(): number {
  const height = useHeaderHeight();
  return floatingHeader ? height : 0;
}

export const barLabelStyle: TextStyle = glassHeader ? { color: PlatformColor('label') } : {};
