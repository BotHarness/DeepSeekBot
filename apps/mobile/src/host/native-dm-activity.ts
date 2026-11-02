import { File, Paths } from 'expo-file-system';
import { useCallback, useSyncExternalStore } from 'react';

import { createDmActivityPreferences } from './dm-activity';

const file = (): File => new File(Paths.document, 'deepseekbot-dm-activity.json');

export const dmActivityPreferences = createDmActivityPreferences({
  async read() {
    const stored = file();
    return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
  },
  write(value) {
    try {
      const stored = file();
      if (!stored.exists) stored.create();
      stored.writeSync(JSON.stringify(value));
    } catch {}
  },
});

export function useHiddenDmActivity(hostId: string | undefined, botSlug: string | undefined) {
  return useSyncExternalStore(
    dmActivityPreferences.subscribe,
    useCallback(() => dmActivityPreferences.hidden(hostId ?? '', botSlug ?? ''), [hostId, botSlug]),
  );
}
