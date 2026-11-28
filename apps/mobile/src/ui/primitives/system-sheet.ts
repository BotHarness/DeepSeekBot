import { createContext } from 'react';
import { Platform, PlatformColor, type ColorValue } from 'react-native';

export const SystemSheet = createContext(false);

export function systemSheetBackdrop(): ColorValue {
  if (Platform.OS !== 'ios') return 'transparent';
  return Number(Platform.Version) >= 26 ? 'transparent' : PlatformColor('systemBackground');
}
