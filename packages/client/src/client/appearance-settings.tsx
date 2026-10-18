import { useSyncExternalStore, type ReactNode, type ReactElement } from 'react';
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client';
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client';
import type { PropsLocale, PropsRenderSlots, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { BotModePrefsFace } from './bot-mode-prefs.js';
import { BotIconSetting, MotionSetting } from './bot-mode-setting-rows.js';
import { SettingsRows, SettingsRow } from './ds/settings-row.js';
import { Select } from './ds/select.js';

export interface AppearanceFace extends BotModePrefsFace {
  themeSource: {
    getSnapshot(): ThemeSnapshot;
    subscribe(listener: () => void): () => void;
    set(value: string): void;
  };
  localeSource: Pick<LocaleRuntime, 'getSnapshot' | 'subscribe' | 'setLocale'>;
}

export function AppearanceSection(
  props: PropsLocale<'botharness'> &
    InjectFace<AppearanceFace> &
    PropsRenderSlots<'botharness.settings.layout'>,
): ReactElement {
  const { t, themeSource, localeSource, renderSlot } = props;
  const theme = useSyncExternalStore(themeSource.subscribe, themeSource.getSnapshot);
  const locale = useSyncExternalStore(localeSource.subscribe, localeSource.getSnapshot);
  return (
    <SettingsRows>
      <SettingsRow
        title={t('settings.theme')}
        control={
          <Select
            label={t('settings.theme')}
            value={theme.preference}
            options={[
              { value: 'system', label: t('settings.theme.system') },
              ...theme.themes.map((item) => ({
                value: item.id,
                label:
                  item.id === 'light'
                    ? t('settings.theme.light')
                    : item.id === 'dark'
                      ? t('settings.theme.dark')
                      : item.id,
              })),
            ]}
            onChange={themeSource.set}
          />
        }
      />
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
    </SettingsRows>
  );
}
