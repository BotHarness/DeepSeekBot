import { useCallback, useSyncExternalStore } from 'react';

import { createHostLooks } from '../../src/host/host-look';
import type { HostLook } from '../../src/ui/design/host-look';

const KEY = 'deepseekbot-host-looks';

export const hostLooks = createHostLooks({
  async read() {
    const stored = localStorage.getItem(KEY);
    return stored === null ? undefined : (JSON.parse(stored) as unknown);
  },
  write(value) {
    localStorage.setItem(KEY, JSON.stringify(value));
  },
  forgetLegacyImages() {},
});

export function useHostLook(hostId: string | undefined): HostLook {
  return useSyncExternalStore(
    hostLooks.subscribe,
    useCallback(() => hostLooks.look(hostId ?? ''), [hostId]),
  );
}
