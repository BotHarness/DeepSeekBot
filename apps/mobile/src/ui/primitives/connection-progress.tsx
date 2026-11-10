import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LoadingIndicator } from './loading-indicator';
import { Text } from './text';
import { space } from '../design/tokens';
import type { ConnectionState } from '../../host/client';
import {
  connectionPresence,
  connectionDisrupted,
  CONNECTION_OFFLINE_MS,
  CONNECTION_QUIET_MS,
  type ConnectionPresence,
} from '../connection-presence';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';

export function useConnectionPresence(
  status?: ConnectionState['status'],
  interrupted = false,
  disruptedSince?: number,
): ConnectionPresence & { label?: string } {
  const t = useStrings();
  const active = connectionDisrupted(status, interrupted);
  const [seen, setSeen] = useState<number>();
  if (!active && seen !== undefined) setSeen(undefined);
  if (active && seen === undefined) setSeen(Date.now());
  const start = active ? (disruptedSince ?? seen ?? Date.now()) : undefined;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (start === undefined) return () => {};
      const timers = [CONNECTION_QUIET_MS, CONNECTION_OFFLINE_MS]
        .map((at) => start + at - Date.now())
        .filter((wait) => wait > 0)
        .map((wait) => setTimeout(notify, wait));
      return () => timers.forEach(clearTimeout);
    },
    [start],
  );
  const elapsed = () =>
    start === undefined
      ? 'none'
      : Date.now() - start >= CONNECTION_OFFLINE_MS
        ? 'long'
        : Date.now() - start >= CONNECTION_QUIET_MS
          ? 'brief'
          : 'quiet';
  const phase = useSyncExternalStore(subscribe, elapsed, elapsed);
  const presence = connectionPresence(
    status,
    interrupted,
    phase === 'none'
      ? undefined
      : phase === 'long'
        ? CONNECTION_OFFLINE_MS
        : phase === 'brief'
          ? CONNECTION_QUIET_MS
          : 0,
  );
  return {
    ...presence,
    ...(presence.progress === 'connecting'
      ? { label: t.connecting }
      : presence.progress === 'reconnecting'
        ? { label: t.reconnecting }
        : {}),
  };
}

export function useConnectionProgress(
  status?: ConnectionState['status'],
  interrupted = false,
  disruptedSince?: number,
): string | undefined {
  return useConnectionPresence(status, interrupted, disruptedSince).label;
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
