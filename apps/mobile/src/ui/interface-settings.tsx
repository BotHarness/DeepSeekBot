import { useSyncExternalStore } from 'react';
import { useColorScheme, View } from 'react-native';
import {
  APPEARANCE_PRESETS,
  APPEARANCE_PRIMARY,
  type AppearanceMode,
} from '@botharness/host-client/ui/design/appearance-palette';
import { interfacePreferences } from './interface-preferences';
import { PreferenceRow } from './primitives/preference-row';
import { Button } from './primitives/button';
import { SettingsForm, SettingsFormItem } from './primitives/settings-form';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { Text } from './primitives/text';
import { colorSwatch, radius, space } from './design/tokens';
import type { LayerName } from './design/layers';
import { useStrings } from './strings';

function usePreferences() {
  return useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
    interfacePreferences.getSnapshot,
  );
}

export function LanguageSetting({ on = 'sheet' }: { on?: LayerName }) {
  const t = useStrings().interfacePreferences;
  const state = usePreferences();
  return (
    <PreferenceRow
      on={on}
      title={t.language}
      icon="language"
      testID="settings-language"
      value={state.language}
      options={[
        { value: 'system', label: t.system, icon: 'system' },
        { value: 'zh', label: '简体中文', icon: 'language' },
        { value: 'en', label: 'English', icon: 'language' },
      ]}
      onChange={interfacePreferences.setLanguage}
    />
  );
}

export function AppearanceSetting({ on = 'sheet' }: { on?: LayerName }) {
  const t = useStrings().interfacePreferences;
  const state = usePreferences();
  return (
    <PreferenceRow
      on={on}
      title={t.appearance}
      icon="appearance"
      testID="settings-appearance"
      value={state.appearance}
      options={[
        { value: 'system', label: t.system, icon: 'system' },
        { value: 'light', label: t.light, icon: 'light' },
        { value: 'dark', label: t.dark, icon: 'dark' },
      ]}
      onChange={interfacePreferences.setAppearance}
    />
  );
}

export function InterfaceSaveNotice() {
  const copy = useStrings();
  const state = usePreferences();
  if (!state.storageError) return null;
  return (
    <SettingsFormItem>
      <View style={{ padding: space.x5, gap: space.x3 }}>
        <Text variant="meta" tone="danger">
          {copy.interfacePreferences.storageError}
        </Text>
        <Button
          label={copy.retry}
          testID="settings-interface-retry"
          onPress={interfacePreferences.retrySave}
        />
      </View>
    </SettingsFormItem>
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <View
      style={{
        width: colorSwatch.size,
        height: colorSwatch.size,
        borderRadius: radius.round,
        backgroundColor: color,
      }}
    />
  );
}

export function AppearanceRow({ on = 'sheet', onPress }: { on?: LayerName; onPress(): void }) {
  const t = useStrings().interfacePreferences;
  const state = usePreferences();
  const system: AppearanceMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const mode = state.appearance === 'system' ? system : state.appearance;
  const scheme = { system: t.system, light: t.light, dark: t.dark }[state.appearance];
  return (
    <SettingsRow
      on={on}
      title={t.appearance}
      icon="appearance"
      detail={`${scheme} · ${t.presets[state.palette[mode].preset]}`}
      disclosure
      testID="settings-appearance"
      onPress={onPress}
    />
  );
}

function PaletteSection({ mode }: { mode: AppearanceMode }) {
  const t = useStrings().interfacePreferences;
  const state = usePreferences();
  const current = state.palette[mode];
  return (
    <SettingsSection on="raised" title={mode === 'light' ? t.light : t.dark}>
      {APPEARANCE_PRESETS.map((preset) => {
        const selected = current.primary === undefined && current.preset === preset;
        return (
          <SettingsRow
            on="raised"
            key={preset}
            title={t.presets[preset]}
            selected={selected}
            leading={<ColorSwatch color={APPEARANCE_PRIMARY[preset][mode]} />}
            control={selected ? { kind: 'check' } : undefined}
            testID={`appearance-palette-${mode}-${preset}`}
            onPress={() => interfacePreferences.setPalettePreset(mode, preset)}
          />
        );
      })}
    </SettingsSection>
  );
}

export function AppearanceSettings() {
  const t = useStrings().interfacePreferences;
  return (
    <SettingsForm>
      <SettingsSection on="raised" footer={t.colorsHint}>
        <AppearanceSetting on="raised" />
      </SettingsSection>
      <PaletteSection mode="light" />
      <PaletteSection mode="dark" />
      <InterfaceSaveNotice />
    </SettingsForm>
  );
}
