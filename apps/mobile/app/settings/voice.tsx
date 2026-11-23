import { useMemo } from 'react';

import {
  addVoiceService,
  browseVoiceCatalog,
  importSharedVoice,
  loadVoiceServices,
  removeVoiceService,
  setVoiceDefault,
  testVoiceService,
} from '@botharness/host-client/voice-providers';
import { useHostSession } from '../../src/host/host-session';
import { SheetNote } from '../../src/ui/chat/sheet';
import { useStrings } from '../../src/ui/strings';
import { VoiceSettings, type VoiceSettingsPort } from '../../src/ui/voice/voice-settings-screen';

export default function VoiceSettingsScreen() {
  const t = useStrings();
  const { saved, client } = useHostSession();
  const port = useMemo<VoiceSettingsPort | undefined>(
    () =>
      client === undefined
        ? undefined
        : {
            load: () => loadVoiceServices(client),
            add: (input) => addVoiceService(client, input),
            remove: async (id) => {
              await removeVoiceService(client, id);
            },
            test: (id) => testVoiceService(client, id),
            setDefault: (kind, providerId, voiceId) =>
              setVoiceDefault(client, kind, providerId, voiceId),
            browse: (input) => browseVoiceCatalog(client, input),
            importVoice: (input) => importSharedVoice(client, input),
          },
    [client],
  );
  if (port === undefined) return <SheetNote>{t.unreachable}</SheetNote>;
  return <VoiceSettings key={saved?.hostId} port={port} />;
}
