import { Platform, PlatformColor, type ColorValue } from 'react-native';

export function systemSheetBackdrop(): ColorValue {
  if (Platform.OS !== 'ios') return 'transparent';
  return Number.parseInt(String(Platform.Version), 10) >= 26
    ? 'transparent'
    : PlatformColor('systemBackground');
}
