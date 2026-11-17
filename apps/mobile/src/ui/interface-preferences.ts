import {
  DEFAULT_APPEARANCE_PRESET,
  isAppearancePreference,
  isAppearancePreset,
  type AppearanceMode,
  type AppearancePalette,
  type AppearancePreference,
  type AppearancePreset,
} from '@botharness/host-client/ui/design/appearance-palette';

export type { AppearancePreference };
export type LanguagePreference = 'system' | 'en' | 'zh';
export type InAppAlertStyle = 'inline' | 'overlay';
export type InterfacePreferences = {
  language: LanguagePreference;
  appearance: AppearancePreference;
  palette: Record<AppearanceMode, AppearancePalette>;
  inAppAlerts: boolean;
  inAppAlertStyle: InAppAlertStyle;
};
export type InterfaceStorage = {
  read(): Promise<unknown>;
  write(value: InterfacePreferences): void;
};

const DEFAULT_PALETTE: AppearancePalette = { preset: DEFAULT_APPEARANCE_PRESET };

function savedPalette(raw: unknown): AppearancePalette {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PALETTE;
  const preset = (raw as Record<string, unknown>)['preset'];
  return isAppearancePreset(preset) ? { preset } : DEFAULT_PALETTE;
}

export function preferredLanguage(locales: readonly string[]): 'en' | 'zh' {
  for (const tag of locales) {
    const language = tag.toLowerCase().split(/[-_]/u)[0];
    if (language === 'zh' || language === 'en') return language;
  }
  return 'en';
}

export function createInterfacePreferences() {
  let system = preferredLanguage([Intl.DateTimeFormat().resolvedOptions().locale]);
  let value: InterfacePreferences = {
    language: 'system',
    appearance: 'system',
    palette: { light: DEFAULT_PALETTE, dark: DEFAULT_PALETTE },
    inAppAlerts: true,
    inAppAlertStyle: 'overlay',
  };
  let snapshot = { ...value, locale: system, loaded: false, storageError: false };
  let storage: InterfaceStorage | undefined;
  let touched = false;
  const listeners = new Set<() => void>();
  const publish = () => {
    snapshot = {
      ...snapshot,
      ...value,
      locale: value.language === 'system' ? system : value.language,
    };
    for (const listener of listeners) listener();
  };
  const persist = () => {
    try {
      storage?.write(value);
      snapshot = { ...snapshot, storageError: false };
    } catch {
      snapshot = { ...snapshot, storageError: true };
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async restore(adapter: InterfaceStorage) {
      storage = adapter;
      try {
        const saved = await adapter.read();
        if (!touched && typeof saved === 'object' && saved !== null) {
          if ('inAppAlerts' in saved && typeof saved.inAppAlerts === 'boolean')
            value.inAppAlerts = saved.inAppAlerts;
          if (
            'inAppAlertStyle' in saved &&
            (saved.inAppAlertStyle === 'inline' || saved.inAppAlertStyle === 'overlay')
          )
            value.inAppAlertStyle = saved.inAppAlertStyle;
          if (
            'language' in saved &&
            (saved.language === 'system' || saved.language === 'en' || saved.language === 'zh')
          )
            value.language = saved.language;
          if ('appearance' in saved && isAppearancePreference(saved.appearance))
            value.appearance = saved.appearance;
          if ('palette' in saved && typeof saved.palette === 'object' && saved.palette !== null) {
            const palette = saved.palette as Record<string, unknown>;
            value.palette = {
              light: savedPalette(palette['light']),
              dark: savedPalette(palette['dark']),
            };
          }
        }
      } catch {
        snapshot = { ...snapshot, storageError: true };
      }
      snapshot = { ...snapshot, loaded: true };
      if (touched) persist();
      publish();
    },
    setLanguage(language: LanguagePreference) {
      touched = true;
      value = { ...value, language };
      if (snapshot.loaded) persist();
      publish();
    },
    setAppearance(appearance: AppearancePreference) {
      touched = true;
      value = { ...value, appearance };
      if (snapshot.loaded) persist();
      publish();
    },
    setPalettePreset(mode: AppearanceMode, preset: AppearancePreset) {
      touched = true;
      value = { ...value, palette: { ...value.palette, [mode]: { preset } } };
      if (snapshot.loaded) persist();
      publish();
    },
    setInAppAlerts(inAppAlerts: boolean) {
      touched = true;
      value = { ...value, inAppAlerts };
      if (snapshot.loaded) persist();
      publish();
    },
    setInAppAlertStyle(inAppAlertStyle: InAppAlertStyle) {
      touched = true;
      value = { ...value, inAppAlertStyle };
      if (snapshot.loaded) persist();
      publish();
    },
    retrySave() {
      if (snapshot.loaded) persist();
      publish();
    },
    setSystemLocales(locales: readonly string[]) {
      const next = preferredLanguage(locales);
      if (next === system) return;
      system = next;
      publish();
    },
  };
}

export const interfacePreferences = createInterfacePreferences();
