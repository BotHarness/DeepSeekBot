import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LoadingIndicator } from './loading-indicator';
import { Text } from './text';
import { space } from '../design/tokens';
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

export function ConnectionProgress({
  active,
  label,
  children,
}: {
  active: boolean;
  label?: string | undefined;
  children?: ReactNode;
}) {
  const theme = useDesignTheme();
  if (!active && children === undefined) return null;
  return (
    <View style={{ flexShrink: label === undefined ? 0 : 1, minWidth: 0 }}>
      {children}
      {active ? (
        <View
          testID="connection-progress"
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            children === undefined ? { flexShrink: 1, minWidth: 0 } : StyleSheet.absoluteFill,
            {
              flexDirection: 'row',
              gap: space.x2,
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          <LoadingIndicator size="control" color={theme.color.fg} />
          {label === undefined ? null : (
            <Text variant="meta" numberOfLines={1} style={{ flexShrink: 1 }}>
              {label}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
