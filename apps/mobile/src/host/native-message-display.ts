import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { createMessageDisplayPreferences } from './message-display';

const file = () => new File(Paths.document, 'deepseekbot-message-display.json');

export const messageDisplayPreferences = createMessageDisplayPreferences({
  async read() {
    const stored = file();
    return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
  },
  write(mode) {
    const stored = file();
    if (!stored.exists) stored.create();
    stored.writeSync(JSON.stringify(mode));
  },
});

export function useMessageDisplay() {
  return useSyncExternalStore(
    messageDisplayPreferences.subscribe,
    messageDisplayPreferences.getSnapshot,
  );
}
