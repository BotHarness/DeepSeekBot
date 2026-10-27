import { Platform } from 'react-native';

const iosMajor = Platform.OS === 'ios' ? Number.parseInt(String(Platform.Version), 10) : 0;

export const systemSegmented = {
  radius: iosMajor >= 26 ? 9999 : 9,
} as const;
