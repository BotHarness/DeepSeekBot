import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { createCallAudioRoutePreference } from './call-audio-route';

const file = () => new File(Paths.document, 'deepseekbot-call-audio-route.json');

export const callAudioRoute = createCallAudioRoutePreference({
  async read() {
    const stored = file();
    return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
  },
  write(route) {
    const stored = file();
    if (!stored.exists) stored.create();
    stored.writeSync(JSON.stringify(route));
  },
});

export function useCallAudioRoute() {
  return useSyncExternalStore(callAudioRoute.subscribe, callAudioRoute.getSnapshot);
}
