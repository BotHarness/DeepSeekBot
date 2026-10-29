import { Platform } from 'react-native';

export const glassHeader =
  Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26;

export const floatingHeader = Platform.OS === 'android';

export const headerIslands = floatingHeader || (Platform.OS === 'ios' && !glassHeader);
