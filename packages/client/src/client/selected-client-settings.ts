import type { Appearance } from './appearance.js';
import { clientSettings } from './client-settings-control.js';
import type { DesktopNotificationPrefs } from './desktop-notifications.js';
import { preferenceSettingsDomain, type PreferenceLocale } from './preference-settings-control.js';
import type { ShortcutBindings } from './shortcut-bindings.js';
import { shortcutSettingsDomain } from './shortcut-settings-control.js';

export function mountSelectedClientSettings(
  appearance: Appearance,
  locale: PreferenceLocale,
  notifications: DesktopNotificationPrefs,
  shortcuts: ShortcutBindings,
): () => void {
  const offPreferences = clientSettings.register(
    'preferences',
    preferenceSettingsDomain(appearance, locale, notifications),
  );
  const offShortcuts = clientSettings.register('shortcuts', shortcutSettingsDomain(shortcuts));
  return () => {
    offShortcuts();
    offPreferences();
  };
}
