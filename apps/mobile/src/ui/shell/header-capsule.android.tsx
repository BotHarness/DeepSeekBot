import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useMaterialRoles } from '../design/material-tokens';
import { radius } from '../design/tokens';

export function HeaderCapsule({ children }: { children: ReactNode }) {
  const roles = useMaterialRoles();
  return (
    <View
      testID="header-capsule"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.round,
        backgroundColor: roles.surfaceContainerHigh,
      }}
    >
      {children}
    </View>
  );
}
