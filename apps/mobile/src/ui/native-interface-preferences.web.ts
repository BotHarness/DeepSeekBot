import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

import { interfacePreferences } from './interface-preferences';

const key = 'deepseekbot.interface.v1';
const refreshLocales = () =>
  interfacePreferences.setSystemLocales(getLocales().map((locale) => locale.languageTag));
refreshLocales();
void interfacePreferences.restore({
  async read() {
    const saved = localStorage.getItem(key);
    return saved === null ? undefined : (JSON.parse(saved) as unknown);
  },
  write(value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
});

function subscribe(notify: () => void) {
  const off = interfacePreferences.subscribe(notify);
  window.addEventListener('languagechange', refreshLocales);
  return () => {
    off();
    window.removeEventListener('languagechange', refreshLocales);
  };
}

export function useNativeInterfacePreferences() {
  return useSyncExternalStore(
    subscribe,
    interfacePreferences.getSnapshot,
    interfacePreferences.getSnapshot,
  );
}
