import { observeResource } from './messaging-defaults-live.js';
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
  const renewCooldown = (id: string) => {
    retryAt.delete(id);
    if (retryAt.size >= 32) {
      const oldest = retryAt.keys().next().value;
      if (oldest !== undefined) retryAt.delete(oldest);
    }
    retryAt.set(id, Date.now() + 30_000);
  };
  type AccountStatus = ReturnType<typeof accountRelationshipStatusSchema.parse>;
  const attempted = new Set<string>();
  let reading = false;
  let current: Exclude<AccountStatus, { state: 'signed-out' }> | undefined;
  const drain = (): void => {
    const status = current;
    if (lifetime.signal.aborted || reading || status === undefined) return;
    for (const relationship of status.relationships) {
      if (pending.size + learning.size >= 2) break;
      if (
        relationship.state !== 'active' ||
        !relationship.accountOrigin ||
        relationship.automaticEnrollmentSuppressed ||
        pending.has(relationship.id) ||
        attempted.has(relationship.id) ||
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
          attempted.add(relationship.id);
          learning.add(relationship.id);
          const learnedGeneration = status.generation;
          const started = Date.now();
          void options.sources
            .learnRelationshipRoutes(
              {
                ...relationship.peer,
                routes: [origin],
              },
              undefined,
              'merge-existing',
            )
            .then(() => {
              if (!lifetime.signal.aborted && generation === learnedGeneration)
                logClient('network', 'account-route-refresh-complete', {
                  initiator: 'background',
                  durationMs: Math.max(0, Date.now() - started),
                });
            })
            .catch((error) => {
              if (!lifetime.signal.aborted && generation === learnedGeneration)
                logClient(
                  'network',
                  'account-route-learning-refused',
                  {
                    initiator: 'background',
                    refusal:
                      error instanceof Error && error.message === 'relationship-route-limit'
                        ? 'relationship-route-limit'
                        : 'route-update-refused',
                    durationMs: Math.max(0, Date.now() - started),
                  },
                  'warn',
                );
            })
            .finally(() => {
              learning.delete(relationship.id);
              if (!lifetime.signal.aborted && generation === learnedGeneration)
                renewCooldown(relationship.id);
              drain();
            });
        }
        continue;
      }
      const abort = new AbortController();
      const enrollmentGeneration = status.generation;
      attempted.add(relationship.id);
      pending.set(relationship.id, abort);
      void options.sources
        .enrollRelationship(relationship, options.clientName, abort.signal, {
          accountGeneration: status.generation,
        })
        .catch(() => undefined)
        .finally(() => {
          if (pending.get(relationship.id) === abort) pending.delete(relationship.id);
          if (!lifetime.signal.aborted && generation === enrollmentGeneration)
            renewCooldown(relationship.id);
          drain();
        });
    }
  };
  const reconcile = async () => {
    reading = true;
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
      current = status.state === 'signed-out' ? undefined : status;
      attempted.clear();
      if (current !== undefined) {
        const activeIds = new Set(status.relationships.map((item) => item.id));
        for (const id of retryAt.keys()) if (!activeIds.has(id)) retryAt.delete(id);
        for (const [id, abort] of pending)
          if (!activeIds.has(id)) abort.abort('relationship-retired');
      }
    } catch {
    } finally {
      reading = false;
      drain();
    }
  };
  const stop = observeResource(
    (change) => change.resource === 'relationships' || change.resource === 'account',
    reconcile,
    10_000,
    30_000,
    true,
  );
  return () => {
    lifetime.abort();
    stop();
    for (const abort of pending.values()) abort.abort('owner-disposed');
    pending.clear();
    learning.clear();
    retryAt.clear();
  };
}
