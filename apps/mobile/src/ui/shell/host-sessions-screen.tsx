import { Redirect, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import type { HostClient } from '@botharness/host-client/client';
import { listHostSessions } from '@botharness/host-client/host-sessions';
import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { useHostSession } from '../../host/host-session';
import { sessionReadHost } from '../../host/session-detail';
import { BotPortrait } from '../bot-avatar';
import { SheetLoading } from '../chat/sheet';
import { pressTint, useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useSessionsTab } from '../interface-settings';
import { ReadFailure } from '../primitives/read-failure';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { useFloatingTabInset } from './floating-tab-inset';
import { AssignmentSessionIcon, ChevronRightIcon } from './icons';

export function HostSessionsScreen() {
  const enabled = useSessionsTab();
  const { client, saved } = useHostSession();
  const t = useStrings().hostSessions;
  if (!enabled) return <Redirect href="/" />;
  return (
    <>
      <Stack.Screen options={{ title: t.title, headerLargeTitleEnabled: false }} />
      {client && saved ? (
        <HostSessionsList
          key={`${saved.hostId}:${saved.deviceId}`}
          client={client}
          hostId={saved.hostId}
        />
      ) : (
        <Text tone="muted" style={{ padding: space.x5 }}>
          {t.offline}
        </Text>
      )}
    </>
  );
}

function HostSessionsList({ client, hostId }: { client: HostClient; hostId: string }) {
  const router = useRouter();
  const t = useStrings().hostSessions;
  const bottom = useFloatingTabInset();
  const [rows, setRows] = useState<HostSessionRow[]>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const flight = useRef<AbortController>(undefined);
  const online = useSyncExternalStore(
    client.subscribe,
    () => client.getSnapshot().connection.status === 'connected',
  );

  const refresh = useCallback(() => {
    if (!online || flight.current !== undefined) return;
    const abort = new AbortController();
    flight.current = abort;
    setFailed(false);
    setBusy(true);
    void listHostSessions(sessionReadHost(client, abort.signal))
      .then(
        (value) => {
          if (!abort.signal.aborted) setRows(value);
        },
        () => {
          if (!abort.signal.aborted) setFailed(true);
        },
      )
      .finally(() => {
        if (flight.current !== abort) return;
        flight.current = undefined;
        setBusy(false);
      });
  }, [client, online]);
  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {
        flight.current?.abort();
        flight.current = undefined;
        setBusy(false);
      };
    }, [refresh]),
  );

  const open = (row: HostSessionRow) => {
    router.push({
      pathname: '/session/[id]',
      params: {
        id: row.sessionId,
        hostId,
        ...(row.source.kind === 'native' ? { source: 'native' } : { slug: row.source.botSlug }),
        ...(row.title === undefined ? {} : { title: row.title }),
      },
    });
  };
  return (
    <FlatList
      testID="host-sessions-list"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: space.x4, paddingBottom: bottom }}
      data={rows}
      keyExtractor={(row) => row.sessionId}
      refreshing={online && busy && rows !== undefined}
      onRefresh={online ? refresh : undefined}
      ListHeaderComponent={
        failed && rows !== undefined ? (
          <ReadFailure title={t.loadFailed} onRetry={refresh} busy={busy} disabled={!online} />
        ) : null
      }
      ListEmptyComponent={
        !online ? (
          <Text tone="muted" style={{ padding: space.x3 }}>
            {t.offline}
          </Text>
        ) : failed ? (
          <ReadFailure title={t.loadFailed} onRetry={refresh} busy={busy} />
        ) : rows === undefined ? (
          <SheetLoading />
        ) : (
          <Text tone="muted" style={{ padding: space.x3 }}>
            {t.empty}
          </Text>
        )
      }
      renderItem={({ item }) => (
        <HostSessionListItem row={item} client={client} onPress={() => open(item)} />
      )}
    />
  );
}

function HostSessionListItem({
  row,
  client,
  onPress,
}: {
  row: HostSessionRow;
  client: HostClient;
  onPress(): void;
}) {
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const title = row.title ?? (row.source.kind === 'bot' ? row.source.displayName : t.untitled);
  const source = row.source.kind === 'native' ? t.native : row.source.displayName;
  const state = row.running ? t.running : t.idle;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, source, row.folderName, state].filter(Boolean).join(', ')}
      testID={`host-session-${row.sessionId}`}
      onPress={onPress}
      android_ripple={{ color: pressTint(theme.color.fg) }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        borderRadius: radius.md,
        padding: space.x3,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        backgroundColor: pressed ? theme.layer.raised.inset : undefined,
      })}
    >
      {row.source.kind === 'bot' ? (
        <BotPortrait
          size={theme.touch}
          bot={{
            slug: row.source.botSlug,
            displayName: row.source.displayName,
            ...(row.source.appearance === undefined ? {} : { appearance: row.source.appearance }),
            ...(row.source.avatarSeed === undefined ? {} : { avatarSeed: row.source.avatarSeed }),
            ...(row.source.avatar === undefined
              ? {}
              : row.source.avatar.startsWith('/')
                ? { avatarSource: client.resource(row.source.avatar) }
                : { avatarUrl: row.source.avatar }),
          }}
        />
      ) : (
        <View
          style={{
            width: theme.touch,
            height: theme.touch,
            borderRadius: radius.md,
            backgroundColor: theme.layer.raised.inset,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AssignmentSessionIcon color={theme.color.muted} size={theme.type.title.line} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
        <Text strong>{title}</Text>
        <Text variant="meta" tone="muted">
          {[row.folderName, state].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <ChevronRightIcon color={theme.color.muted} size={theme.type.meta.line} />
    </Pressable>
  );
}
