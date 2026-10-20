import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { t } from '../strings';

type NativeProps = ViewProps & { enabled: boolean; title: string; onSend(): void };

export const nativeHardwareSend = requireOptionalNativeModule('HardwareSend') !== null;
const NativeSend = nativeHardwareSend ? requireNativeView<NativeProps>('HardwareSend') : undefined;

export function HardwareSend({
  enabled,
  onSend,
  style,
  children,
}: {
  enabled: boolean;
  enter: boolean;
  onSend(): void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  if (NativeSend === undefined) return <View style={style}>{children}</View>;
  return (
    <NativeSend enabled={enabled} title={t.send} onSend={() => onSend()} style={style}>
      {children}
    </NativeSend>
  );
}
