import { useMemo } from 'react';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { useHostSession, useHostSessions } from '../../host/host-session';
import { useConversationFilter } from '../../host/native-conversation-filter';
import { useHostLocalNames } from '../../host/native-host-look';
import { canCreateNativeSession } from '../../ui/shell/page-create-actions';
import { useStrings } from '../../ui/strings';
import { SessionDrawerPanel } from './session-drawer-panel';
import { openDrawerSession, openNewSession } from './session-drawer-navigation';
import { useDrawerPlace } from './session-drawer-state';
import type { SessionQueryHost } from './use-session-query';

export function SessionDrawerContent({ active }: { active: boolean }) {
  const t = useStrings().hostSessions;
  const { saved } = useHostSession();
  const connected = useHostSessions();
  const [scope] = useConversationFilter();
  const place = useDrawerPlace();
  const scoped = connected.find((host) => computerEnvironmentKey(host.saved.hostId) === scope);
  const chosen =
    scoped === undefined
      ? connected.filter((host) => host.snapshot.connection.status === 'connected')
      : [scoped];
  const key = chosen.map((host) => `${host.saved.hostId}:${host.saved.deviceId}`).join('|');
  const names = useHostLocalNames(chosen.map((host) => host.saved.hostId));
  const nameKey = names.join('\n');
  const hosts = useMemo<SessionQueryHost[]>(
    () =>
      chosen.map((host, index) => ({
        hostId: host.saved.hostId,
        hostName: names[index] || host.saved.hostName,
        client: host.client,
      })),
    [key, nameKey],
  );
  if (hosts.length === 0) return null;
  const title = scoped === undefined ? t.allEnvironments : hosts[0]!.hostName;
  return (
    <SessionDrawerPanel
      key={key}
      hosts={hosts}
      title={title}
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
