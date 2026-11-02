import { StyleSheet, View } from 'react-native';

import { edge, radius } from '../design/tokens';
import { useDesignTheme } from '../design/theme';

export function DrawerMaterial({ rounded = false }: { rounded?: boolean; glassPanel?: boolean }) {
  const theme = useDesignTheme();
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: rounded ? radius.lg : radius.round,
          borderWidth: edge.hairline,
          borderColor: theme.layer.raised.edge,
          backgroundColor: theme.layer.raised.fill,
        },
      ]}
    />
  );
}

export function useLiquidGlass(): boolean {
  return false;
}

export const SidebarMaterial: (props: { cornerRadius: number }) => null = () => null;

export const EdgeMaterial: (props: { edge: 'top' | 'bottom' }) => null = () => null;
