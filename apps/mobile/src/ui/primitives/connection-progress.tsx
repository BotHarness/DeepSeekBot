import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LoadingIndicator } from './loading-indicator';
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
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          <LoadingIndicator size="control" color={theme.color.fg} />
        </View>
      ) : null}
    </View>
  );
}
