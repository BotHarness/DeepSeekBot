import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { createBotCreationController } from './bot-creation';
import { botCreationTransport } from './bot-creation-transport';
import { hostSession } from './host-session';
import { nativeCarrier } from './native-carrier';

const file = () => new File(Paths.document, 'deepseekbot-bot-creation-v1.json');

export const botCreation = createBotCreationController({
  key: () => `mobile:${randomUUID()}`,
  port: botCreationTransport(() => hostSession.getState().hosts, nativeCarrier()),
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

export function useBotCreation() {
  return useSyncExternalStore(botCreation.subscribe, botCreation.getSnapshot);
}
