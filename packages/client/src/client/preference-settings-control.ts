import type { Appearance, AppearancePreference } from './appearance.js';
import {
  ClientSettingsError,
  settingsRevision,
  type ClientSettingsDomain,
} from './client-settings-control.js';
import type { DesktopNotificationPrefs } from './desktop-notifications.js';

export interface PreferenceLocale {
  getSnapshot(): { active: string; locales: readonly { id: string; label: string }[] };
  setLocale(id: string): void;
}

const THEMES: readonly AppearancePreference[] = ['system', 'light', 'dark'];
const PATCH_KEYS = new Set(['theme', 'locale', 'notifications']);

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function preferenceSettingsDomain(
  appearance: Appearance,
  locale: PreferenceLocale,
  notifications: DesktopNotificationPrefs,
): ClientSettingsDomain {
  const read = () => {
    appearance.refresh();
    notifications.refreshPermission();
    const view = appearance.getSnapshot();
    if (view.error) throw new ClientSettingsError(view.error);
    const language = locale.getSnapshot();
    const alerts = notifications.getSnapshot();
    const state = {
      theme: { preference: view.config.preference, mode: view.mode, scope: 'client' },
      locale: {
        active: language.active,
        available: language.locales.map((entry) => ({ id: entry.id, label: entry.label })),
        scope: 'host',
      },
      notifications: {
        enabled: alerts.enabled,
        permission: alerts.permission,
        active: alerts.enabled && alerts.permission === 'granted',
        scope: 'client',
      },
    };
    return {
      revision: settingsRevision({
        theme: state.theme.preference,
        locale: state.locale.active,
        notifications: state.notifications.enabled,
        permission: state.notifications.permission,
      }),
      ...state,
    };
  };
  return {
    read,
    async write(raw, request) {
      const patch = object(raw);
      if (
        !patch ||
        !Object.keys(patch).length ||
        Object.keys(patch).some((key) => !PATCH_KEYS.has(key))
      )
        throw new ClientSettingsError('client-settings-invalid-input');
      const theme = patch.theme;
      if (theme !== undefined && !THEMES.includes(theme as AppearancePreference))
        throw new ClientSettingsError('client-settings-invalid-input');
      const language = patch.locale;
      if (
        language !== undefined &&
        (typeof language !== 'string' ||
          !locale.getSnapshot().locales.some((entry) => entry.id === language))
      )
        throw new ClientSettingsError('locale-unknown');
      const alerts = patch.notifications === undefined ? undefined : object(patch.notifications);
      if (
        patch.notifications !== undefined &&
        (!alerts || Object.keys(alerts).length !== 1 || typeof alerts.enabled !== 'boolean')
      )
        throw new ClientSettingsError('client-settings-invalid-input');
      const current = read();
      if (current.revision !== request.expectedRevision)
        throw new ClientSettingsError('client-settings-revision-conflict');
      if (alerts?.enabled === true && !current.notifications.active) {
        const permission = current.notifications.permission;
        if (permission === 'unsupported') throw new ClientSettingsError('notification-unsupported');
        if (permission === 'denied')
          throw new ClientSettingsError(
            'notification-permission-denied',
            'notification-permission-denied: the Client blocked notifications; only the Human can allow them in the browser or OS settings.',
          );
        if (permission === 'default')
          throw new ClientSettingsError(
            'notification-permission-pending',
            'notification-permission-pending: the Human must turn notifications on in this Client so the browser or OS can ask for consent; nothing was changed.',
          );
      }
      request.assertLive();
      if (theme !== undefined && theme !== current.theme.preference)
        appearance.update({ preference: theme }, appearance.getSnapshot().config.revision);
      if (language !== undefined) locale.setLocale(language as string);
      if (alerts !== undefined && alerts.enabled !== current.notifications.enabled)
        await notifications.setEnabled(alerts.enabled as boolean);
      return read();
    },
  };
}
