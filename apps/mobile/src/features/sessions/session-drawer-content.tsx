import { useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HostClient } from '@botharness/host-client/client';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { useHostSession, useHostSessions } from '../../host/host-session';
import { useConversationFilter } from '../../host/native-conversation-filter';
import { useHostLocalNames } from '../../host/native-host-look';
import { space } from '../../ui/design/tokens';
import { Text } from '../../ui/primitives/text';
import { canCreateNativeSession } from '../../ui/shell/page-create-actions';
import { useStrings } from '../../ui/strings';
import { SessionDrawerPanel } from './session-drawer-panel';
import { openDrawerSession, openNewSession } from './session-drawer-navigation';
import { useDrawerPlace } from './session-drawer-state';
import type { SessionQueryHost } from './use-session-query';

const clientIds = new WeakMap<HostClient, number>();
let nextClientId = 0;

function clientId(client: HostClient): number {
  let id = clientIds.get(client);
  if (id === undefined) {
    id = ++nextClientId;
    clientIds.set(client, id);
  }
  return id;
}

export function SessionDrawerContent({ active }: { active: boolean }) {
  const t = useStrings().hostSessions;
  const { saved } = useHostSession();
  const connected = useHostSessions();
  const [scope] = useConversationFilter();
  const place = useDrawerPlace();
  const all = scope === 'all';
  const scoped = connected.find((host) => computerEnvironmentKey(host.saved.hostId) === scope);
  const chosen =
    scoped !== undefined
      ? [scoped]
      : all
        ? connected.filter((host) => host.snapshot.connection.status === 'connected')
        : [];
  const names = useHostLocalNames(chosen.map((host) => host.saved.hostId));
  const shown = chosen.map((host, index) => names[index] || host.saved.hostName);
  const key = JSON.stringify(
    chosen.map((host, index) => [
      host.saved.hostId,
      host.saved.deviceId,
      shown[index],
      clientId(host.client),
    ]),
  );
  const hosts = useMemo<SessionQueryHost[]>(
    () =>
      chosen.map((host, index) => ({
        hostId: host.saved.hostId,
        hostName: shown[index]!,
        client: host.client,
      })),
    [key],
  );
  if (hosts.length === 0)
    return (
      <SessionDrawerNotice
        title={all ? t.allEnvironments : t.title}
        message={all ? t.offline : t.computerScopeOnly}
      />
    );
  return (
    <SessionDrawerPanel
      key={key}
      hosts={hosts}
      title={scoped === undefined ? t.allEnvironments : hosts[0]!.hostName}
      showHost={scoped === undefined}
      active={active}
      selected={
        place.sessionId === undefined || saved == null
          ? undefined
          : { hostId: place.hostId ?? saved.hostId, sessionId: place.sessionId }
      }
      canCreate={chosen.some((host) => canCreateNativeSession(host.saved))}
      onOpen={(row) => openDrawerSession(row.hostId, row)}
      onNew={openNewSession}
    />
  );
}

function SessionDrawerNotice({ title, message }: { title: string; message: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="session-drawer-notice"
      style={{
        flex: 1,
        paddingTop: insets.top + space.x2,
        paddingHorizontal: space.x5,
        gap: space.x4,
      }}
    >
      <Text variant="title" strong accessibilityRole="header">
        {title}
      </Text>
      <Text tone="muted">{message}</Text>
    </View>
  );
}
