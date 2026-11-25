import { useSyncExternalStore, type RefCallback } from 'react';
import type { HostClient } from '@botharness/host-client/client';
import { readHostSessionList } from '@botharness/host-client/host-sessions';
import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { sessionReadHost } from '../../host/session-detail';
import { tabMenu } from '../design/tokens';
import { useMounted } from '../mounted';

const RECENT_FETCH = 50;

type Recent = { hostId: string; rows: readonly HostSessionRow[] };

export function createRecentSessions(limit: number) {
  let current: Recent | undefined;
  let flight: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (hostId: string, rows: readonly HostSessionRow[]) => {
    const next = rows.slice(0, limit);
    if (
      current?.hostId === hostId &&
      current.rows.length === next.length &&
      current.rows.every(
        (row, index) =>
          row.sessionId === next[index]?.sessionId && row.title === next[index]?.title,
      )
    )
      return;
    current = { hostId, rows: next };
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    get: (hostId: string | undefined): readonly HostSessionRow[] | undefined =>
      hostId !== undefined && current?.hostId === hostId ? current.rows : undefined,
    publish,
    refresh(client: Pick<HostClient, 'call'>, hostId: string): Promise<void> {
      flight?.abort();
      const abort = new AbortController();
      flight = abort;
      return readHostSessionList(sessionReadHost(client, abort.signal), {
        search: '',
        sort: 'last-human-turn',
        source: 'all',
        limit: RECENT_FETCH,
      }).then(
        (value) => {
          if (!abort.signal.aborted) publish(hostId, value.sessions);
        },
        () => undefined,
      );
    },
  };
}

export const recentSessions = createRecentSessions(tabMenu.recent);

export function useRecentSessions(
  client: HostClient | undefined,
  hostId: string | undefined,
  online: boolean,
  refreshKey: string | undefined,
): { rows: readonly HostSessionRow[] | undefined; load: RefCallback<unknown> } {
  const load = useMounted<unknown>(() => {
    if (client !== undefined && hostId !== undefined && online)
      void recentSessions.refresh(client, hostId);
  }, [client, hostId, online, refreshKey]);
  const rows = useSyncExternalStore(recentSessions.subscribe, () => recentSessions.get(hostId));
  return { rows, load };
}
