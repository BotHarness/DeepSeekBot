import { Platform, PlatformColor } from 'react-native';

export { variantRamp as systemType } from './system-type';

export const systemColors = {
  label: PlatformColor('label'),
  secondaryLabel: PlatformColor('secondaryLabel'),
  tertiaryLabel: PlatformColor('tertiaryLabel'),
  separator: PlatformColor('separator'),
  background: PlatformColor('systemBackground'),
  secondaryBackground: PlatformColor('secondarySystemBackground'),
  groupedBackground: PlatformColor('systemGroupedBackground'),
  secondaryGroupedBackground: PlatformColor('secondarySystemGroupedBackground'),
  fill: PlatformColor('systemFill'),
} as const;

const iosMajor = Platform.OS === 'ios' ? Number.parseInt(String(Platform.Version), 10) : 0;

export const systemSegmented = {
  radius: iosMajor >= 26 ? 9999 : 9,
} as const;
