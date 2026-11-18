import { useCallback, useState } from 'react';
import { View, type ViewInstance } from 'react-native';

import {
  promptPresetChanges,
  promptPresetStale,
  type PromptLibrary,
} from '@botharness/host-client/prompt-presets';
import { SHEET_GROUP } from './chat/sheet';
import { useMounted } from './mounted';
import { SettingsForm, SettingsFormItem } from './primitives/settings-form';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { LoadFailed, Loading, Notice, errorText } from './request-parts';
import { useStrings } from './strings';

export interface PromptPresetSettingsPort {
  load(): Promise<PromptLibrary>;
  setGlobal(presetId: string | null): Promise<unknown>;
}

const BUILT_IN = 'built-in';

export function PromptPresetSettings({ port }: { port: PromptPresetSettingsPort }) {
  const t = useStrings();
  const [library, setLibrary] = useState<PromptLibrary>();
  const [loadError, setLoadError] = useState<string>();
  const [saving, setSaving] = useState<string>();
  const [failure, setFailure] = useState<string>();

  const load = useCallback(() => {
    setLoadError(undefined);
    return port.load().then(setLibrary, (reason: unknown) => setLoadError(errorText(reason)));
  }, [port]);
  const mount = useMounted<ViewInstance>(() => void load(), [load]);

  const choose = (value: string) => {
    if (library === undefined || saving !== undefined) return;
    if (value === (library.globalPresetId ?? BUILT_IN)) return;
    setSaving(value);
    setFailure(undefined);
    port
      .setGlobal(value === BUILT_IN ? null : value)
      .then(load, (reason: unknown) => setFailure(`${t.prompts.failed} ${errorText(reason)}`))
      .finally(() => setSaving(undefined));
  };

  const options = [
    { value: BUILT_IN, title: t.prompts.builtIn },
    ...(library?.presets ?? []).map((preset) => ({ value: preset.id, title: preset.name })),
  ];
  const current = library?.globalPresetId ?? BUILT_IN;

  return (
    <View ref={mount} style={{ flex: 1 }}>
      <SettingsForm testID="prompt-preset-settings">
        {loadError === undefined ? null : (
          <SettingsFormItem>
            <LoadFailed error={loadError} onRetry={() => void load()} />
          </SettingsFormItem>
        )}
        {library === undefined && loadError === undefined ? (
          <SettingsFormItem>
            <Loading />
          </SettingsFormItem>
        ) : null}
        {failure === undefined ? null : (
          <SettingsFormItem>
            <Notice tone="danger">{failure}</Notice>
          </SettingsFormItem>
        )}
        {library === undefined ? null : (
          <>
            <SettingsSection
              title={t.prompts.global}
              footer={t.prompts.globalHint}
              on={SHEET_GROUP}
            >
              {options.map((option) => (
                <SettingsRow
                  key={option.value}
                  on={SHEET_GROUP}
                  title={option.title}
                  testID={`prompt-global-${option.value}`}
                  selected={option.value === current}
                  {...(saving === option.value
                    ? { control: { kind: 'busy' as const } }
                    : option.value === current
                      ? { control: { kind: 'check' as const } }
                      : {})}
                  onPress={() => choose(option.value)}
                />
              ))}
            </SettingsSection>
            <SettingsSection
              title={t.prompts.presets}
              footer={t.prompts.presetsHint}
              on={SHEET_GROUP}
            >
              {library.presets.length === 0 ? (
                <SettingsRow on={SHEET_GROUP} title={t.prompts.none} tone="muted" />
              ) : (
                library.presets.map((preset) => (
                  <SettingsRow
                    key={preset.id}
                    on={SHEET_GROUP}
                    title={preset.name}
                    testID={`prompt-preset-${preset.id}`}
                    detail={[
                      ...(preset.id === library.globalPresetId ? [t.prompts.globalTag] : []),
                      t.prompts.changed(promptPresetChanges(preset)),
                      ...(promptPresetStale(preset, library.parts)
                        ? [t.prompts.defaultChanged]
                        : []),
                    ].join(' · ')}
                  />
                ))
              )}
            </SettingsSection>
          </>
        )}
      </SettingsForm>
    </View>
  );
}
