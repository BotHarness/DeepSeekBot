import type { ReactNode } from 'react';
import { View } from 'react-native';

export function FixedToolbar({ height, children }: { height: number; children: ReactNode }) {
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}
    >
      {children}
    </View>
  );
}
