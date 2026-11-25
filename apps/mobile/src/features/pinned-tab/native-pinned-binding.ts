import { File, Paths } from 'expo-file-system';
import { useCallback, useSyncExternalStore } from 'react';

import { createPinnedBindings, type PinnedBinding } from './pinned-binding';

const file = () => new File(Paths.document, 'deepseekbot-pinned-tab.json');

export const pinnedBindings = createPinnedBindings({
  async read() {
    const stored = file();
    return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
  },
  write(value) {
    const stored = file();
    if (!stored.exists) stored.create();
    stored.writeSync(JSON.stringify(value));
  },
});

export function usePinnedBinding(hostId: string | undefined): PinnedBinding | undefined {
  return useSyncExternalStore(
    pinnedBindings.subscribe,
    useCallback(
      () => (hostId === undefined ? undefined : pinnedBindings.binding(hostId)),
      [hostId],
    ),
  );
}

export function usePinnedBindingsSettled(): boolean {
  return useSyncExternalStore(pinnedBindings.subscribe, pinnedBindings.settled);
}
