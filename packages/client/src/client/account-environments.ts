import { accountRelationshipStatusSchema } from '../../../core/src/devices/relationship-contract.js';
import type { RemoteHosts } from './remote-hosts.js';
import { relationshipRequest } from './relationships.js';

export function startAccountEnvironments(options: {
  sources: RemoteHosts;
  clientName: string;
  request?: typeof relationshipRequest;
}) {
  const request = options.request ?? relationshipRequest;
  const lifetime = new AbortController();
  const pending = new Map<string, AbortController>();
  const retryAt = new Map<string, number>();
  let generation: string | undefined;
  let nextDiscovery = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    try {
      const discover = Date.now() >= nextDiscovery;
      if (discover) nextDiscovery = Date.now() + 30_000;
      const status = accountRelationshipStatusSchema.parse(
        await request(
          { action: discover ? 'discover-account' : 'account-status' },
          lifetime.signal,
        ),
      );
      if (lifetime.signal.aborted) return;
      const nextGeneration = status.state === 'signed-out' ? undefined : status.generation;
      if (nextGeneration !== generation) {
        for (const abort of pending.values()) abort.abort();
        retryAt.clear();
        generation = nextGeneration;
      }
      if (status.state !== 'signed-out') {
        const activeIds = new Set(status.relationships.map((item) => item.id));
        for (const [id, abort] of pending) if (!activeIds.has(id)) abort.abort();
        for (const relationship of status.relationships) {
          if (pending.size >= 2) break;
          if (
            relationship.state !== 'active' ||
            !relationship.accountOrigin ||
            relationship.automaticEnrollmentSuppressed ||
            pending.has(relationship.id) ||
            (retryAt.get(relationship.id) ?? 0) > Date.now()
          )
            continue;
          if (
            options.sources
              .getSnapshot()
              .hosts.some((item) => item.host.hostId === relationship.peer.id)
          )
            continue;
          const abort = new AbortController();
          pending.set(relationship.id, abort);
          void options.sources
            .enrollRelationship(relationship, options.clientName, abort.signal, {
              accountGeneration: status.generation,
            })
            .catch(() => undefined)
            .finally(() => {
              if (pending.get(relationship.id) === abort) pending.delete(relationship.id);
              if (!lifetime.signal.aborted && retryAt.size < 32)
                retryAt.set(relationship.id, Date.now() + 30_000);
            });
        }
      }
    } catch {
      // A failed account check cannot authorize new enrollment.
    } finally {
      if (!lifetime.signal.aborted) timer = setTimeout(() => void poll(), 2500);
    }
  };
  void poll();
  return () => {
    lifetime.abort();
    clearTimeout(timer);
    for (const abort of pending.values()) abort.abort();
    pending.clear();
    retryAt.clear();
  };
}
