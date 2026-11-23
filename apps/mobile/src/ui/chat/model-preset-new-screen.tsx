import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { errorText } from '@botharness/host-client/bot-settings';
import type { HostClient } from '@botharness/host-client/client';
import { createModelPreset, DEFAULT_MODEL_PRESET_ID } from '@botharness/host-client/model-plans';
import { presetSubFromLegacy, presetSubWithEngine } from '@botharness/host-protocol/preset-sub';
import { useHostSession } from '../../host/host-session';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { SheetPage } from '../primitives/sheet-page';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';
import { useModels } from './model-settings-screen';
import { SheetFailed, SheetLoading, SheetNote } from './sheet';

export function ModelPresetNewScreen() {
  const t = useStrings();
  const { client, saved } = useHostSession();
  if (client === undefined) return <SheetNote>{t.unreachable}</SheetNote>;
  return <ModelPresetNewView key={saved?.hostId} client={client} />;
}

function ModelPresetNewView({ client }: { client: HostClient }) {
  const t = useStrings();
  const router = useRouter();
  const models = useModels(client, { kind: 'global' });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const focused = useRef(true);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const value = models.value;
  const source = value?.presets.find((preset) => preset.id === DEFAULT_MODEL_PRESET_ID);
  const create = () => {
    if (source === undefined || busy || name.trim() === '') return;
    setBusy(true);
    setError(undefined);
    createModelPreset(client, {
      name: name.trim(),
      ...(source.orchestratorGroupId === undefined
        ? { orchestrator: source.orchestrator }
        : {
            orchestratorGroupId: source.orchestratorGroupId,
            ...(source.orchestratorGroupEffort === undefined
              ? {}
              : { orchestratorGroupEffort: source.orchestratorGroupEffort }),
          }),
      ...(source.orchestratorEngine === undefined
        ? {}
        : { orchestratorEngine: source.orchestratorEngine }),
      sub: source.sub ?? presetSubWithEngine(presetSubFromLegacy(source), source.assignmentEngine),
    }).then(
      (preset) => {
        setBusy(false);
        if (focused.current)
          router.replace({ pathname: '/settings/model-preset', params: { id: preset.id } });
      },
      (cause: unknown) => {
        setError(errorText(cause));
        setBusy(false);
      },
    );
  };
  return (
    <SheetPage title={t.modelConfig.newPreset}>
      {value === undefined ? (
        models.error === undefined ? (
          <SheetLoading />
        ) : (
          <SheetFailed message={t.modelFailed} onRetry={models.refresh} />
        )
      ) : (
        <KeyboardFormScroll
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: space.x4, paddingVertical: space.x3 }}
        >
          <SheetNote>{t.modelConfig.newPresetHint}</SheetNote>
          <View style={{ paddingHorizontal: space.x5, gap: space.x3 }}>
            <TextField
              testID="model-preset-new-name"
              value={name}
              onChangeText={setName}
              autoFocus
              accessibilityLabel={t.modelSettings.name}
              placeholder={t.modelSettings.name}
              onSubmitEditing={create}
            />
            <Button
              testID="model-preset-new-create"
              label={t.modelConfig.create}
              busy={busy}
              disabled={name.trim() === '' || source === undefined}
              onPress={create}
            />
          </View>
          {error === undefined ? null : <SheetNote>{error}</SheetNote>}
        </KeyboardFormScroll>
      )}
    </SheetPage>
  );
}
