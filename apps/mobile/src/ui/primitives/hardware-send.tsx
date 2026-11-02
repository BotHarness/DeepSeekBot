import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export const nativeHardwareSend = false;

export function HardwareSend({
  style,
  children,
}: {
  enabled: boolean;
  enter: boolean;
  onSend(): void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return <View style={style}>{children}</View>;
}
