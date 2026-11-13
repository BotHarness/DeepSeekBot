import { accountRelationshipStatusSchema } from '../../../core/src/devices/relationship-contract.js';
import type { RemoteHosts } from './remote-hosts.js';
import { relationshipRequest } from './relationships.js';
import { logClient } from './diagnostic-log.js';

export function startAccountEnvironments(options: {
  sources: RemoteHosts;
  clientName: string;
  request?: typeof relationshipRequest;
}) {
  const request = options.request ?? relationshipRequest;
  const lifetime = new AbortController();
  const pending = new Map<string, AbortController>();
  const learning = new Set<string>();
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
        for (const abort of pending.values()) abort.abort('account-changed');
        retryAt.clear();
        generation = nextGeneration;
      }
      if (status.state !== 'signed-out') {
        const activeIds = new Set(status.relationships.map((item) => item.id));
        for (const [id, abort] of pending)
          if (!activeIds.has(id)) abort.abort('relationship-retired');
        for (const relationship of status.relationships) {
          if (pending.size + learning.size >= 2) break;
          if (
            relationship.state !== 'active' ||
            !relationship.accountOrigin ||
            relationship.automaticEnrollmentSuppressed ||
            pending.has(relationship.id) ||
            (retryAt.get(relationship.id) ?? 0) > Date.now()
          )
            continue;
          const saved = options.sources
            .getSnapshot()
            .hosts.find((item) => item.host.hostId === relationship.peer.id);
          if (saved) {
            const origin = relationship.accountOrigin.officialOrigin;
            if (
              origin &&
              relationship.peer.routes.includes(origin) &&
              !saved.host.routes.includes(origin) &&
              saved.host.encryption?.hostKey === relationship.peer.publicKey &&
              !saved.host.encryption.privateRelay &&
              !learning.has(relationship.id)
            ) {
              learning.add(relationship.id);
              const learnedGeneration = status.generation;
              const started = Date.now();
              void options.sources
                .learnRelationshipRoutes({
                  ...relationship.peer,
                  routes: [...new Set([origin, ...saved.host.routes])],
                })
                .then(() => {
                  if (!lifetime.signal.aborted && generation === learnedGeneration)
                    logClient('network', 'account-route-learned', {
                      initiator: 'background',
                      durationMs: Math.max(0, Date.now() - started),
                    });
                })
                .catch(() => {
                  if (!lifetime.signal.aborted && generation === learnedGeneration)
                    logClient(
                      'network',
                      'account-route-learning-refused',
                      {
                        initiator: 'background',
                        refusal: 'route-update-refused',
                        durationMs: Math.max(0, Date.now() - started),
                      },
                      'warn',
                    );
                })
                .finally(() => {
                  learning.delete(relationship.id);
                  if (
                    !lifetime.signal.aborted &&
                    generation === learnedGeneration &&
                    retryAt.size < 32
                  )
                    retryAt.set(relationship.id, Date.now() + 30_000);
                });
            }
            continue;
          }
          const abort = new AbortController();
          const enrollmentGeneration = status.generation;
          pending.set(relationship.id, abort);
          void options.sources
            .enrollRelationship(relationship, options.clientName, abort.signal, {
              accountGeneration: status.generation,
            })
            .catch(() => undefined)
            .finally(() => {
              if (pending.get(relationship.id) === abort) pending.delete(relationship.id);
              if (
                !lifetime.signal.aborted &&
                generation === enrollmentGeneration &&
                retryAt.size < 32
              )
                retryAt.set(relationship.id, Date.now() + 30_000);
            });
        }
      }
    } catch {
    } finally {
      if (!lifetime.signal.aborted) timer = setTimeout(() => void poll(), 2500);
    }
  };
  void poll();
  return () => {
    lifetime.abort();
    clearTimeout(timer);
    for (const abort of pending.values()) abort.abort('owner-disposed');
    pending.clear();
    learning.clear();
    retryAt.clear();
  };
}
