import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { createBotCreationController } from './bot-creation';
import { botCreationTransport } from './bot-creation-transport';
import { hostSession } from './host-session';
import { nativeCarrier } from './native-carrier';
import { nativeZipFiles, pruneZipFiles } from './native-zip-import-file';
import { mobileTelemetry } from '../telemetry/native';

const file = () => new File(Paths.document, 'deepseekbot-bot-creation-v1.json');

export const botCreation = createBotCreationController({
  telemetry: mobileTelemetry,
  key: () => `mobile:${randomUUID()}`,
  port: botCreationTransport(() => hostSession.getState().hosts, nativeCarrier(), nativeZipFiles),
  storage: {
    async read() {
      const saved = file();
      return saved.exists ? JSON.parse(await saved.text()) : undefined;
    },
    async write(record) {
      file().writeSync(JSON.stringify(record));
      const source = record.kind === 'draft' ? record.draft.source : record.operation.source;
      pruneZipFiles(
        [
          source,
          ...(record.unavailableOperations ?? []).map((operation) => operation.source),
        ].flatMap((source) => (source?.kind === 'zip' ? [source.fileId] : [])),
      );
    },
  },
});

export function useBotCreation() {
  return useSyncExternalStore(botCreation.subscribe, botCreation.getSnapshot);
}
