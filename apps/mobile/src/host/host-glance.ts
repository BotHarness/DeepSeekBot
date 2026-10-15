import type { ConnectionState, HostClient } from './client';
import type { SavedHost } from './hosts';
import { actionCount, type InboxSnapshot } from './inbox';
import type { HumanAttentionPage } from './wire';

export type HostStatus = 'online' | 'offline' | 'checking';

export interface HostGlance {
  status: HostStatus;
  pending?: number;
  unread?: number;
}

const LIMIT = 100;

export function liveGlance(connection: ConnectionState, inbox: InboxSnapshot): HostGlance {
  switch (connection.status) {
    case 'connected':
      return inbox.status === 'ready'
        ? { status: 'online', pending: actionCount(inbox) }
        : { status: 'online' };
    case 'connecting':
    case 'reconnecting':
      return { status: 'checking' };
    default:
      return { status: 'offline' };
  }
}

export async function glanceHost(client: HostClient): Promise<HostGlance> {
  try {
    const [action, unread] = await Promise.all(
      (['action', 'unread'] as const).map((category) =>
        client.call<HumanAttentionPage>('humanAttention', { category, limit: LIMIT }),
      ),
    );
    return { status: 'online', pending: action!.items.length, unread: unread!.items.length };
  } catch {
    return { status: 'offline' };
  }
}

export interface HostGlances {
  getSnapshot(): Readonly<Record<string, HostGlance>>;
  subscribe(listener: () => void): () => void;
  watch(hosts: readonly SavedHost[]): () => void;
}

export function createHostGlances(open: (host: SavedHost) => HostClient): HostGlances {
  const listeners = new Set<() => void>();
  let snapshot: Readonly<Record<string, HostGlance>> = {};
  let round = 0;

  const publish = (hostId: string, glance: HostGlance): void => {
    snapshot = { ...snapshot, [hostId]: glance };
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    watch(hosts) {
      round += 1;
      const current = round;
      for (const host of hosts) {
        if (snapshot[host.hostId] === undefined) publish(host.hostId, { status: 'checking' });
        void glanceHost(open(host)).then((glance) => {
          if (current === round) publish(host.hostId, glance);
        });
      }
      return () => {
        if (current === round) round += 1;
      };
    },
  };
}
