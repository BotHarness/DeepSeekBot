import { Platform, PlatformColor, type ColorValue } from 'react-native';
import { iosMajor } from '../platform-version';

export function systemSheetBackdrop(): ColorValue {
  if (Platform.OS !== 'ios') return 'transparent';
  return iosMajor() >= 26 ? 'transparent' : PlatformColor('systemBackground');
}
