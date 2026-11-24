import type { ReactNode } from 'react';
import { View } from 'react-native';

export function HeaderCapsule({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center' }}>{children}</View>;
}
