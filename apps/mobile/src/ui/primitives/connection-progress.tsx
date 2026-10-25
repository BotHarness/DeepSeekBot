import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { ConnectionState } from '../../host/client';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';

export function useConnectionProgress(
  status?: ConnectionState['status'],
  interrupted = false,
): string | undefined {
  const t = useStrings();
  if (status === 'connecting') return t.connecting;
  if (status === 'reconnecting' || (status === 'connected' && interrupted)) return t.reconnecting;
  return undefined;
}

/** The identity keeps its footprint; its accessible parent names connection progress. */
export function ConnectionProgress({ active, children }: { active: boolean; children: ReactNode }) {
  const theme = useDesignTheme();
  return (
    <View>
      {children}
      {active ? (
        <View
          testID="connection-progress"
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          <ActivityIndicator size="small" color={theme.color.fg} accessible={false} />
        </View>
      ) : null}
    </View>
  );
}
