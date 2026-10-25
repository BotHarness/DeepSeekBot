import { File, Paths } from 'expo-file-system';
import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';
import { AppState, Appearance } from 'react-native';

import { interfacePreferences } from './interface-preferences';

const refreshLocales = () =>
  interfacePreferences.setSystemLocales(getLocales().map((locale) => locale.languageTag));
refreshLocales();
const file = () => new File(Paths.document, 'deepseekbot-interface.json');
void interfacePreferences.restore({
  async read() {
    const stored = file();
    return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
  },
  write(value) {
    const stored = file();
    if (!stored.exists) stored.create();
    stored.writeSync(JSON.stringify(value));
  },
});

function subscribeNative(notify: () => void) {
  let appearance = interfacePreferences.getSnapshot().appearance;
  const apply = () => Appearance.setColorScheme(appearance === 'system' ? 'auto' : appearance);
  apply();
  const off = interfacePreferences.subscribe(() => {
    const next = interfacePreferences.getSnapshot().appearance;
    if (appearance !== next) {
      appearance = next;
      apply();
    }
    notify();
  });
  const listener = AppState.addEventListener('change', (state) => {
    if (state === 'active') refreshLocales();
  });
  return () => {
    off();
    listener.remove();
  };
}

export function useNativeInterfacePreferences() {
  return useSyncExternalStore(
    subscribeNative,
    interfacePreferences.getSnapshot,
    interfacePreferences.getSnapshot,
  );
}
