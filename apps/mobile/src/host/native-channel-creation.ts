import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { createChannelCreation } from './channel-creation';
import { channelCreationTransport } from './channel-creation-transport';
import { hostSession } from './host-session';
import { nativeCarrier } from './native-carrier';

const file = () => new File(Paths.document, 'deepseekbot-channel-creation-v1.json');
export const channelCreation = createChannelCreation({
  key: () => `mobile:${randomUUID()}`,
  port: channelCreationTransport(() => hostSession.getState().hosts, nativeCarrier()),
  storage: {
    async read() {
      const saved = file();
      return saved.exists ? JSON.parse(await saved.text()) : undefined;
    },
    async write(record) {
      file().writeSync(JSON.stringify(record));
    },
  },
});
export function useChannelCreation() {
  return useSyncExternalStore(channelCreation.subscribe, channelCreation.getSnapshot);
}
