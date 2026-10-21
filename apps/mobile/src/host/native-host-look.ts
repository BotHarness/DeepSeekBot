import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useSyncExternalStore } from 'react';

import type { HostLook } from '../ui/design/host-look';
import { createHostLooks } from './host-look';

const file = (): File => new File(Paths.document, 'deepseekbot-host-looks.json');

export const hostLooks = createHostLooks({
  async read() {
    const stored = file();
    if (!stored.exists) return undefined;
    return JSON.parse(await stored.text()) as unknown;
  },
  write(value) {
    try {
      const stored = file();
      if (!stored.exists) stored.create();
      stored.writeSync(JSON.stringify(value));
    } catch {}
  },
  forgetLegacyImages() {
    try {
      const pictures = new Directory(Paths.document, 'host-looks');
      if (pictures.exists) pictures.delete();
    } catch {}
  },
});

export function useHostLook(hostId: string | undefined): HostLook {
  return useSyncExternalStore(
    hostLooks.subscribe,
    useCallback(() => hostLooks.look(hostId ?? ''), [hostId]),
  );
}
