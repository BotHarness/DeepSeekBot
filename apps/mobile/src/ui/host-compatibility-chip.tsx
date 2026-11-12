import { useSyncExternalStore } from 'react';

import type { HostCompatibility } from '../host/client';
import { StatusChip } from './primitives/status-chip';
import { useStrings } from './strings';

const dismissed = new Set<string>();
const listeners = new Set<() => void>();
let revision = 0;

const dismissalKey = (hostId: string, compatibility: HostCompatibility) =>
  `${hostId}:${compatibility.update ?? ''}:${compatibility.hostVersion ?? ''}`;

export function dismissCompatibility(hostId: string, compatibility: HostCompatibility): void {
  dismissed.add(dismissalKey(hostId, compatibility));
  revision += 1;
  for (const listener of listeners) listener();
}

function useDismissals(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => revision,
  );
}

export function HostCompatibilityChips({
  hosts,
  named,
}: {
  hosts: readonly { hostId: string; name: string; compatibility: HostCompatibility | undefined }[];
  named: boolean;
}) {
  const t = useStrings();
  useDismissals();
  return hosts.map(({ hostId, name, compatibility }) => {
    if (compatibility?.update === undefined) return null;
    if (dismissed.has(dismissalKey(hostId, compatibility))) return null;
    const message =
      compatibility.update === 'host'
        ? t.hostCompatibility.updateHost
        : t.hostCompatibility.updateApp;
    return (
      <StatusChip
        key={hostId}
        testID={`host-compatibility-${compatibility.update}`}
        tone="muted"
        label={named ? `${name} · ${message}` : message}
        action={{
          label: t.hostCompatibility.dismiss,
          testID: 'host-compatibility-dismiss',
          onPress: () => dismissCompatibility(hostId, compatibility),
        }}
      />
    );
  });
}
