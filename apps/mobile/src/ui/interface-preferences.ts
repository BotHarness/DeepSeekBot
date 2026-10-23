export type LanguagePreference = 'system' | 'en' | 'zh';
export type AppearancePreference = 'system' | 'light' | 'dark';
export type InterfacePreferences = {
  language: LanguagePreference;
  appearance: AppearancePreference;
};
export type InterfaceStorage = {
  read(): Promise<unknown>;
  write(value: InterfacePreferences): void;
};

export function preferredLanguage(locales: readonly string[]): 'en' | 'zh' {
  for (const tag of locales) {
    const language = tag.toLowerCase().split(/[-_]/u)[0];
    if (language === 'zh' || language === 'en') return language;
  }
  return 'en';
}

export function createInterfacePreferences() {
  let system = preferredLanguage([Intl.DateTimeFormat().resolvedOptions().locale]);
  let value: InterfacePreferences = { language: 'system', appearance: 'system' };
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
          if (
            'language' in saved &&
            (saved.language === 'system' || saved.language === 'en' || saved.language === 'zh')
          )
            value.language = saved.language;
          if (
            'appearance' in saved &&
            (saved.appearance === 'system' ||
              saved.appearance === 'light' ||
              saved.appearance === 'dark')
          )
            value.appearance = saved.appearance;
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
