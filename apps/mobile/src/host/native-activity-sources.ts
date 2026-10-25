import { useRef, useSyncExternalStore } from 'react';
import { useHostSessions } from './host-session';
import { useConversationFilter } from './native-conversation-filter';
import { includesComputerActivity } from './conversation-environments';
import { hostLooks } from './native-host-look';
import { shownHostName } from '../ui/design/host-look';
import type { ActivitySource } from './activity-sources';

export function useActivitySources(): readonly ActivitySource[] {
  const hosts = useHostSessions();
  const [scope] = useConversationFilter();
  useSyncExternalStore(hostLooks.subscribe, () =>
    JSON.stringify(hosts.map((host) => hostLooks.look(host.saved.hostId))),
  );
  const previous = useRef<readonly ActivitySource[]>([]);
  const next = hosts
    .filter(
      (host) =>
        host.snapshot.connection.status === 'connected' &&
        includesComputerActivity(scope, host.saved.hostId),
    )
    .map((host) => ({
      hostId: host.saved.hostId,
      label: shownHostName(hostLooks.look(host.saved.hostId), host.saved.hostName),
      client: host.client,
      inbox: host.inbox,
      get roster() {
        return host.client.getSnapshot().roster;
      },
    }));
  if (
    next.length !== previous.current.length ||
    next.some((source, index) => {
      const old = previous.current[index];
      return !old || source.client !== old.client || source.label !== old.label;
    })
  )
    previous.current = next;
  return previous.current;
}
