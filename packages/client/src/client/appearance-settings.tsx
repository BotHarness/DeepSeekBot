import { AppearanceRecoverySettings } from './appearance-recovery-settings.js';
import { WallpaperSettings } from './wallpaper-settings.js';
import type { Wallpaper } from './wallpaper.js';
import { AppearanceMaterialSettings } from './appearance-material-settings.js';
import { useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import type { Appearance, AppearancePatch } from './appearance.js';
import type { SettingsLayoutSlots } from './bot-settings-slot.js';
import { BotIconSetting, type BotModeSettingRowProps } from './bot-mode-setting-rows.js';
import { SettingsRow, SettingsRows, SettingsSection } from './ds/settings-row.js';
import {
  ColorSchemePicker,
  PrimaryColorPicker,
  StylePicker,
  ThemePresetPicker,
  applyPreset,
} from './appearance-pickers.js';
import { Icon } from './ds/icon.js';
import { Note } from './ds/note.js';

interface AppearanceOwners {
  appearance: Appearance;
  wallpaper: Wallpaper;
}

export function AppearanceSection(
  props: BotModeSettingRowProps & AppearanceOwners & SettingsLayoutSlots & { clientOnly?: boolean },
): ReactElement {
  const { t, appearance, wallpaper, renderSlot } = props;
  const theme = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot);
  const change = (patch: AppearancePatch) => {
    try {
      appearance.update(patch);
    } catch {}
  };
  return (
    <SettingsRows>
      <Note>{t('appearance.local')}</Note>
      {theme.error && <Note tone="danger">{t('appearance.saveFailed')}</Note>}
      <SettingsSection title={t('settings.theme')}>
        <ColorSchemePicker
          value={theme.config.preference}
          config={theme.config}
          t={t}
          onChange={(preference) => change({ preference })}
        />
      </SettingsSection>
      <SettingsSection title={t('appearance.style')}>
        <StylePicker
          value={theme.config.style ?? 'a'}
          t={t}
          onChange={(style) => change({ style })}
        />
      </SettingsSection>
      <SettingsSection title={t('appearance.palette')}>
        <SettingsRow
          title={t('appearance.primary')}
          icon={<Icon name="palette" />}
          control={(['light', 'dark'] as const).map((mode) => (
            <PrimaryColorPicker
              key={mode}
              mode={mode}
              config={theme.config.modes[mode]}
              t={t}
              onChange={(primary) => change({ mode, primary })}
            />
          ))}
        >
          <ThemePresetPicker
            config={theme.config}
            t={t}
            onSelect={(preset) => applyPreset(appearance, preset)}
          />
        </SettingsRow>
      </SettingsSection>
      <WallpaperSettings owner={wallpaper} appearance={appearance} t={t} />
      <AppearanceMaterialSettings appearance={appearance} snapshot={theme} t={t} />
      {props.clientOnly
        ? (renderSlot(
            'botharness.settings.layout',
            {},
            { only: 'workspace-layout' },
          ) as unknown as ReactNode)
        : null}
      <AppearanceRecoverySettings appearance={appearance} wallpaper={wallpaper} t={t} />
      {props.clientOnly ? null : (
        <SettingsSection title={t('remoteHosts.this')}>
          <BotIconSetting {...props} />
        </SettingsSection>
      )}
      {props.clientOnly
        ? null
        : (renderSlot('botharness.settings.layout', {}) as unknown as ReactNode)}
    </SettingsRows>
  );
}
