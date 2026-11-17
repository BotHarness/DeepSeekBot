import { useState } from 'react';
import { View } from 'react-native';

import {
  APPEARANCE_PRESETS,
  type Scheme,
  type ThemePreset,
  type ThemeStyle,
  type WallpaperMedia,
} from './appearance-model';
import { SHEET_GROUP } from './chat/sheet';
import { appearanceStore, type AppearanceSnapshot } from './native-appearance';
import { Button } from './primitives/button';
import { PreferenceRow } from './primitives/preference-row';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { SettingsForm } from './primitives/settings-form';
import { Text } from './primitives/text';
import { space } from './design/tokens';
import { useStrings } from './strings';

const STYLES: readonly ThemeStyle[] = ['default', 'glass', 'image'];

export type PickResult = WallpaperMedia | 'video-unavailable' | undefined;

export type WallpaperPorts = {
  pick(): Promise<PickResult>;
};

export function AppearanceSettingsContent({
  snapshot,
  wallpaper,
}: {
  snapshot: AppearanceSnapshot;
  wallpaper: WallpaperPorts;
}) {
  const copy = useStrings();
  const t = copy.themeSettings;
  const doc = snapshot.document;
  const interfaceCopy = copy.interfacePreferences;
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const styleLabels: Record<ThemeStyle, string> = {
    default: interfaceCopy.system,
    glass: t.glass,
    image: copy.chatBackground.image,
  };
  const chooseWallpaper = () => {
    if (importing) return;
    setImporting(true);
    setError(false);
    setVideoUnavailable(false);
    void wallpaper
      .pick()
      .then((result) => {
        if (result === 'video-unavailable') setVideoUnavailable(true);
        else if (result !== undefined) appearanceStore.setWallpaper(result);
      })
      .catch(() => setError(true))
      .finally(() => setImporting(false));
  };

  return (
    <SettingsForm>
      <SettingsSection title={t.preset} on={SHEET_GROUP} footer={t.presetHint}>
        <SchemePresetRow
          scheme="light"
          title={interfaceCopy.light}
          value={doc.modes.light.preset}
          presetNames={t.presetNames}
        />
        <SchemePresetRow
          scheme="dark"
          title={interfaceCopy.dark}
          value={doc.modes.dark.preset}
          presetNames={t.presetNames}
        />
        <PreferenceRow
          on={SHEET_GROUP}
          title={copy.chatBackground.type}
          icon="appearance"
          testID="theme-style"
          value={doc.style}
          options={STYLES.map((style) => ({ value: style, label: styleLabels[style] }))}
          onChange={(style) => appearanceStore.setStyle(style)}
        />
      </SettingsSection>
      <SettingsSection on={SHEET_GROUP} footer={t.glassHint}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.glass}
          control={{
            kind: 'switch',
            value: doc.materialEnabled,
            onChange: (enabled) => appearanceStore.setGlass(enabled),
            disabled: !snapshot.loaded,
            testID: 'theme-glass-toggle',
          }}
        />
      </SettingsSection>
      <SettingsSection on={SHEET_GROUP} footer={t.wallpaperHint}>
        <SettingsRow
          on={SHEET_GROUP}
          title={t.wallpaper}
          icon="background"
          control={{
            kind: 'value',
            text: doc.wallpaper === undefined ? copy.chatBackground.useDefault : t.chooseWallpaper,
            chevron: true,
          }}
          onPress={chooseWallpaper}
          testID="theme-wallpaper-choose"
        />
        {doc.wallpaper === undefined ? null : (
          <SettingsRow
            on={SHEET_GROUP}
            title={t.clearWallpaper}
            onPress={() => appearanceStore.setWallpaper(undefined)}
            testID="theme-wallpaper-clear"
          />
        )}
        {videoUnavailable ? (
          <View style={{ padding: space.x5 }}>
            <Text variant="meta" tone="warning" testID="theme-wallpaper-video-unavailable">
              {t.wallpaperVideoUnavailable}
            </Text>
          </View>
        ) : null}
        {error ? (
          <View style={{ padding: space.x5, gap: space.x2 }}>
            <Text variant="meta" tone="danger">
              {t.wallpaperImportFailed}
            </Text>
            <Button
              label={copy.retry}
              variant="text"
              onPress={chooseWallpaper}
              testID="theme-wallpaper-retry"
            />
          </View>
        ) : null}
      </SettingsSection>
      {snapshot.storageError ? (
        <SettingsSection on={SHEET_GROUP}>
          <View style={{ padding: space.x5, gap: space.x2 }}>
            <Text variant="meta" tone="danger">
              {t.storageError}
            </Text>
            <Button
              label={copy.retry}
              variant="text"
              onPress={() => appearanceStore.retrySave()}
              testID="theme-storage-retry"
            />
          </View>
        </SettingsSection>
      ) : null}
    </SettingsForm>
  );
}

function SchemePresetRow({
  scheme,
  title,
  value,
  presetNames,
}: {
  scheme: Scheme;
  title: string;
  value: ThemePreset;
  presetNames: Record<ThemePreset, string>;
}) {
  return (
    <PreferenceRow
      on={SHEET_GROUP}
      title={title}
      icon="appearance"
      testID={`theme-preset-${scheme}`}
      value={value}
      options={APPEARANCE_PRESETS.map((preset) => ({
        value: preset,
        label: presetNames[preset],
      }))}
      onChange={(preset) => appearanceStore.setPreset(scheme, preset)}
    />
  );
}
