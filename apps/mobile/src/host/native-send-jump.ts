import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { createTogglePreference } from './toggle-preference';

const file = () => new File(Paths.document, 'deepseekbot-send-jump.json');

export const sendJumpPreferences = createTogglePreference(
  {
    async read() {
      const stored = file();
      return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
    },
    write(enabled) {
      const stored = file();
      if (!stored.exists) stored.create();
      stored.writeSync(JSON.stringify(enabled));
    },
  },
  false,
);

export function useSendJumpPreferences() {
  return useSyncExternalStore(sendJumpPreferences.subscribe, sendJumpPreferences.getSnapshot);
}
