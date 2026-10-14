import { useSyncExternalStore, type ReactElement } from 'react';
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives';

import type { DesktopNotificationPrefs } from './desktop-notifications.js';
import { SettingsRow } from './ds/settings-row.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ShortcutHelp } from './shortcut-help.js';

export function DesktopNotificationSetting({
  desktopNotifications,
  t,
}: {
  desktopNotifications: DesktopNotificationPrefs;
  t: BotHarnessTranslate;
}): ReactElement {
  const state = useSyncExternalStore(
    desktopNotifications.subscribe,
    desktopNotifications.getSnapshot,
  );
  const checked = state.enabled && state.permission === 'granted';
  const description =
    state.permission === 'unsupported'
      ? t('desktopNotify.row.unsupported')
      : state.permission === 'denied'
        ? t('desktopNotify.row.denied')
        : t('desktopNotify.row.description');
  return (
    <SettingsRow
      title={t('desktopNotify.row.title')}
      description={description}
      data={{ 'data-bh-setting': 'desktop-notifications' }}
      control={
        <Switch
          checked={checked}
          disabled={state.permission === 'unsupported' || state.permission === 'denied'}
          onChange={(enabled) => void desktopNotifications.setEnabled(enabled)}
          label={t('desktopNotify.row.title')}
        />
      }
    />
  );
}

export function ShortcutHelpSetting({
  shortcutHelp,
  t,
}: {
  shortcutHelp: ShortcutHelp;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <SettingsRow
      title={t('shortcuts.row.title')}
      description={t('shortcuts.row.description')}
      control={
        <Button size="sm" variant="toolbar" onClick={shortcutHelp.open}>
          {t('shortcuts.row.open')}
        </Button>
      }
    />
  );
}
