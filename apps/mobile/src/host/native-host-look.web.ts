import { useCallback, useSyncExternalStore } from 'react';

import type { HostLook } from '@botharness/host-client/ui/design/host-look';
import { createHostLooks } from '@botharness/host-client/host-look';

const KEY = 'deepseekbot.host-looks.v1';

function store(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export const hostLooks = createHostLooks({
  async read() {
    const stored = store()?.getItem(KEY);
    return stored === null || stored === undefined ? undefined : (JSON.parse(stored) as unknown);
  },
  write(value) {
    const storage = store();
    if (!storage) throw new Error('storage-unavailable');
    storage.setItem(KEY, JSON.stringify(value));
  },
  forgetLegacyImages() {},
});

export function useHostLook(hostId: string | undefined): HostLook {
  return useSyncExternalStore(
    hostLooks.subscribe,
    useCallback(() => hostLooks.look(hostId ?? ''), [hostId]),
  );
}
