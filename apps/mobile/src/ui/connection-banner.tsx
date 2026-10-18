import { Text } from './primitives/system-text';
import { Pressable, View } from 'react-native';

import type { ConnectionState } from '../host/client';
import { t } from './strings';
import { useTheme } from './theme';

export function ConnectionBanner({
  connection,
  onRetry,
  onPairAgain,
}: {
  connection: ConnectionState;
  onRetry(): void;
  onPairAgain(): void;
}) {
  const theme = useTheme();
  if (connection.status === 'connected' || connection.status === 'stopped') return null;
  const severe = connection.status === 'refused' || connection.status === 'unreachable';
  const title =
    connection.status === 'connecting'
      ? t.connecting
      : connection.status === 'reconnecting'
        ? t.reconnecting
        : connection.status === 'unreachable'
          ? t.unreachable
          : t.refused;
  const detail =
    connection.status === 'unreachable' || connection.status === 'refused'
      ? connection.reason
      : undefined;
  return (
    <View
      accessibilityRole="alert"
      style={{
        margin: 16,
        marginBottom: 0,
        padding: 12,
        borderRadius: 12,
        backgroundColor:
          connection.status === 'refused'
            ? theme.dangerSurface
            : severe
              ? theme.warningSurface
              : theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        gap: 4,
      }}
    >
      <Text style={{ color: theme.ink, fontSize: 15, fontWeight: '600' }}>{title}</Text>
      {detail !== undefined ? (
        <Text style={{ color: theme.inkSoft, fontSize: 13 }}>{detail}</Text>
      ) : null}
      {connection.status === 'unreachable' ? (
        <Text style={{ color: theme.inkSoft, fontSize: 13 }} selectable>
          {t.tried}: {connection.route}
        </Text>
      ) : null}
      {severe ? (
        <Pressable
          onPress={connection.status === 'refused' ? onPairAgain : onRetry}
          accessibilityRole="button"
          style={{ alignSelf: 'flex-start', paddingVertical: 6 }}
        >
          <Text style={{ color: theme.accent, fontSize: 15, fontWeight: '600' }}>
            {connection.status === 'refused' ? t.pairAgain : t.retry}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
