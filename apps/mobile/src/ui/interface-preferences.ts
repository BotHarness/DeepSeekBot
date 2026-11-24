import { useSyncExternalStore } from 'react';
import { isHostSessionSort, type HostSessionSort } from '@botharness/host-protocol/host-sessions';

export type LanguagePreference = 'system' | 'en' | 'zh';
export type AppearancePreference = 'system' | 'light' | 'dark';
export type InAppAlertStyle = 'inline' | 'overlay';
export type SessionNavigationStyle = 'drawer' | 'stacked';
export type SessionLaunchLanding = 'new' | 'list' | 'last';
export type SessionReturnLanding = 'stay' | 'new' | 'list';
export type InterfacePreferences = {
  language: LanguagePreference;
  appearance: AppearancePreference;
  sessionsTab: boolean;
  sessionSort: HostSessionSort;
  hideBotSessions: boolean;
  sessionNavigation: SessionNavigationStyle;
  sessionLaunch: SessionLaunchLanding;
  sessionReturn: SessionReturnLanding;
  inAppAlerts: boolean;
  inAppAlertStyle: InAppAlertStyle;
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
  let value: InterfacePreferences = {
    language: 'system',
    appearance: 'system',
    sessionsTab: false,
    sessionSort: 'last-human-turn',
    hideBotSessions: false,
    sessionNavigation: 'drawer',
    sessionLaunch: 'new',
    sessionReturn: 'stay',
    inAppAlerts: true,
    inAppAlertStyle: 'overlay',
  };
  let snapshot = { ...value, locale: system, loaded: false, storageError: false };
  let storage: InterfaceStorage | undefined;
  const touched = new Set<keyof InterfacePreferences>();
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
  const change = <K extends keyof InterfacePreferences>(key: K, next: InterfacePreferences[K]) => {
    if (!snapshot.loaded) touched.add(key);
    value = { ...value, [key]: next };
    if (snapshot.loaded) persist();
    publish();
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
        if (typeof saved === 'object' && saved !== null) {
          if (
            !touched.has('sessionsTab') &&
            'sessionsTab' in saved &&
            typeof saved.sessionsTab === 'boolean'
          )
            value.sessionsTab = saved.sessionsTab;
          if (
            !touched.has('sessionSort') &&
            'sessionSort' in saved &&
            isHostSessionSort(saved.sessionSort)
          )
            value.sessionSort = saved.sessionSort;
          if (
            !touched.has('hideBotSessions') &&
            'hideBotSessions' in saved &&
            typeof saved.hideBotSessions === 'boolean'
          )
            value.hideBotSessions = saved.hideBotSessions;
          if (
            !touched.has('sessionNavigation') &&
            'sessionNavigation' in saved &&
            (saved.sessionNavigation === 'drawer' || saved.sessionNavigation === 'stacked')
          )
            value.sessionNavigation = saved.sessionNavigation;
          if (
            !touched.has('sessionLaunch') &&
            'sessionLaunch' in saved &&
            (saved.sessionLaunch === 'new' ||
              saved.sessionLaunch === 'list' ||
              saved.sessionLaunch === 'last')
          )
            value.sessionLaunch = saved.sessionLaunch;
          if (
            !touched.has('sessionReturn') &&
            'sessionReturn' in saved &&
            (saved.sessionReturn === 'stay' ||
              saved.sessionReturn === 'new' ||
              saved.sessionReturn === 'list')
          )
            value.sessionReturn = saved.sessionReturn;
          if (
            !touched.has('inAppAlerts') &&
            'inAppAlerts' in saved &&
            typeof saved.inAppAlerts === 'boolean'
          )
            value.inAppAlerts = saved.inAppAlerts;
          if (
            !touched.has('inAppAlertStyle') &&
            'inAppAlertStyle' in saved &&
            (saved.inAppAlertStyle === 'inline' || saved.inAppAlertStyle === 'overlay')
          )
            value.inAppAlertStyle = saved.inAppAlertStyle;
          if (
            !touched.has('language') &&
            'language' in saved &&
            (saved.language === 'system' || saved.language === 'en' || saved.language === 'zh')
          )
            value.language = saved.language;
          if (
            !touched.has('appearance') &&
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
      if (touched.size > 0) persist();
      touched.clear();
      publish();
    },
    setLanguage(language: LanguagePreference) {
      change('language', language);
    },
    setAppearance(appearance: AppearancePreference) {
      change('appearance', appearance);
    },
    setSessionsTab(sessionsTab: boolean) {
      change('sessionsTab', sessionsTab);
    },
    setSessionSort(sessionSort: HostSessionSort) {
      change('sessionSort', sessionSort);
    },
    setHideBotSessions(hideBotSessions: boolean) {
      change('hideBotSessions', hideBotSessions);
    },
    setSessionNavigation(sessionNavigation: SessionNavigationStyle) {
      change('sessionNavigation', sessionNavigation);
    },
    setSessionLaunch(sessionLaunch: SessionLaunchLanding) {
      change('sessionLaunch', sessionLaunch);
    },
    setSessionReturn(sessionReturn: SessionReturnLanding) {
      change('sessionReturn', sessionReturn);
    },
    setInAppAlerts(inAppAlerts: boolean) {
      change('inAppAlerts', inAppAlerts);
    },
    setInAppAlertStyle(inAppAlertStyle: InAppAlertStyle) {
      change('inAppAlertStyle', inAppAlertStyle);
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

const sessionsTabSnapshot = () => interfacePreferences.getSnapshot().sessionsTab;
const sessionSortSnapshot = () => interfacePreferences.getSnapshot().sessionSort;

const hideBotSessionsSnapshot = () => interfacePreferences.getSnapshot().hideBotSessions;

export function useHideBotSessions() {
  return useSyncExternalStore(
    interfacePreferences.subscribe,
    hideBotSessionsSnapshot,
    hideBotSessionsSnapshot,
  );
}

export function useSessionSort() {
  return useSyncExternalStore(
    interfacePreferences.subscribe,
    sessionSortSnapshot,
    sessionSortSnapshot,
  );
}

export function useSessionsTab() {
  return useSyncExternalStore(
    interfacePreferences.subscribe,
    sessionsTabSnapshot,
    sessionsTabSnapshot,
  );
}

const sessionNavigationSnapshot = () => interfacePreferences.getSnapshot().sessionNavigation;

export function useSessionNavigationStyle() {
  return useSyncExternalStore(
    interfacePreferences.subscribe,
    sessionNavigationSnapshot,
    sessionNavigationSnapshot,
  );
}
