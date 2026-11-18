import { useMemo } from 'react';

import { loadPromptLibrary, setGlobalPromptPreset } from '@botharness/host-client/prompt-presets';
import { useHostSession } from '../../src/host/host-session';
import {
  PromptPresetSettings,
  type PromptPresetSettingsPort,
} from '../../src/ui/prompt-preset-settings';

export default function PromptPresetsScreen() {
  const { saved, client } = useHostSession();
  const port = useMemo<PromptPresetSettingsPort | undefined>(
    () =>
      client === undefined
        ? undefined
        : {
            load: () => loadPromptLibrary(client),
            setGlobal: (presetId) => setGlobalPromptPreset(client, presetId),
          },
    [client],
  );
  if (port === undefined) return null;
  return <PromptPresetSettings key={saved?.hostId} port={port} />;
}
