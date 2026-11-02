import { AppearanceRecoverySettings } from './appearance-recovery-settings.js';
import { WallpaperSettings } from './wallpaper-settings.js';
import type { Wallpaper } from './wallpaper.js';
import { AppearanceMaterialSettings } from './appearance-material-settings.js';
import { useSyncExternalStore, type ReactNode, type ReactElement } from 'react';
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client';
import type { Appearance, AppearancePatch } from './appearance.js';
import type { PropsLocale, PropsRenderSlots, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { BotModePrefsFace } from './bot-mode-prefs.js';
import { BotIconSetting, MotionSetting } from './bot-mode-setting-rows.js';
import { SettingsRows, SettingsRow, SettingsSection } from './ds/settings-row.js';
import {
  ColorSchemePicker,
  PrimaryColorPicker,
  ThemePresetPicker,
  applyPreset,
} from './appearance-pickers.js';
import { Select } from './ds/select.js';
import { Note } from './ds/note.js';

export interface AppearanceFace extends BotModePrefsFace {
  appearance: Appearance;
  wallpaper: Wallpaper;
  localeSource: Pick<LocaleRuntime, 'getSnapshot' | 'subscribe' | 'setLocale'>;
}

export function AppearanceSection(
  props: PropsLocale<'botharness'> &
    InjectFace<AppearanceFace> &
    PropsRenderSlots<'botharness.settings.layout'>,
): ReactElement {
  const { t, appearance, wallpaper, localeSource, renderSlot } = props;
  const theme = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot);
  const locale = useSyncExternalStore(localeSource.subscribe, localeSource.getSnapshot);
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
      <SettingsSection title={t('appearance.palette')}>
        <ThemePresetPicker
          config={theme.config}
          t={t}
          onSelect={(preset) => applyPreset(appearance, preset)}
        />
        <SettingsRow
          title={t('appearance.primary')}
          control={(['light', 'dark'] as const).map((mode) => (
            <PrimaryColorPicker
              key={mode}
              mode={mode}
              config={theme.config.modes[mode]}
              t={t}
              onChange={(primary) => change({ mode, primary })}
            />
          ))}
        />
      </SettingsSection>
      <WallpaperSettings owner={wallpaper} appearance={appearance} t={t} />
      <AppearanceMaterialSettings appearance={appearance} snapshot={theme} t={t} />
      <MotionSetting {...props} />
      <BotIconSetting {...props} />
      <SettingsRow
        title={t('settings.language')}
        control={
          <Select
            label={t('settings.language')}
            value={locale.active}
            options={locale.locales.map((item) => ({ value: item.id, label: item.label }))}
            onChange={localeSource.setLocale}
          />
        }
      />
      {renderSlot('botharness.settings.layout', {}) as unknown as ReactNode}
      <AppearanceRecoverySettings appearance={appearance} wallpaper={wallpaper} t={t} />
    </SettingsRows>
  );
}
