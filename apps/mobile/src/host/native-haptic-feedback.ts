import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { setHapticsEnabled } from '../ui/haptics';
import { createHapticPreferences } from './haptic-feedback';

setHapticsEnabled(false);

const file = () => new File(Paths.document, 'deepseekbot-haptic-feedback.json');

export const hapticPreferences = createHapticPreferences({
  async read() {
    const stored = file();
    return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
  },
  write(enabled) {
    const stored = file();
    if (!stored.exists) stored.create();
    stored.writeSync(JSON.stringify(enabled));
  },
});

hapticPreferences.subscribe(() => {
  const state = hapticPreferences.getSnapshot();
  setHapticsEnabled(state.loaded && state.enabled);
});

export function useHapticPreferences() {
  return useSyncExternalStore(hapticPreferences.subscribe, hapticPreferences.getSnapshot);
}
