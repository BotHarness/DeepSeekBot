import { Platform } from 'react-native';

export function iosMajor(): number {
  if (Platform.OS !== 'ios') return 0;
  const major = Number.parseInt(String(Platform.Version), 10);
  return Number.isNaN(major) ? 0 : major;
}
