import type { HostSnapshot } from './client';
import { liveGlance, type HostStatus } from './host-glance';

interface AvailabilityHost {
  saved: { hostId: string };
  snapshot: Pick<HostSnapshot, 'connection'>;
}

export interface HostAvailability {
  hostId: string;
  status: HostStatus;
}

export function hostAvailabilitySource(source: {
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly AvailabilityHost[];
}) {
  let previous: readonly AvailabilityHost[] | undefined;
  let value: readonly HostAvailability[] = [];
  return {
    subscribe: source.subscribe,
    getSnapshot: (): readonly HostAvailability[] => {
      const hosts = source.getSnapshot();
      if (hosts === previous) return value;
      previous = hosts;
      const next = hosts.map((host) => ({
        hostId: host.saved.hostId,
        status: liveGlance(host.snapshot.connection, { status: 'idle' }).status,
      }));
      if (
        next.length !== value.length ||
        next.some(
          (host, index) =>
            host.hostId !== value[index]?.hostId || host.status !== value[index]?.status,
        )
      )
        value = next;
      return value;
    },
  };
}
