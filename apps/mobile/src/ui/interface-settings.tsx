import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { interfacePreferences } from './interface-preferences';
import { PreferenceRow } from './primitives/preference-row';
import { Text } from './primitives/text';
import { space } from './design/tokens';
import { useStrings } from './strings';

export function InterfaceSettings() {
  const t = useStrings().interfacePreferences;
  const state = useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
    interfacePreferences.getSnapshot,
  );
  return (
    <>
      <PreferenceRow
        title={t.language}
        testID="settings-language"
        value={state.language}
        options={[
          { value: 'system', label: t.system },
          { value: 'zh', label: '简体中文' },
          { value: 'en', label: 'English' },
        ]}
        onChange={interfacePreferences.setLanguage}
      />
      <PreferenceRow
        title={t.appearance}
        testID="settings-appearance"
        value={state.appearance}
        options={[
          { value: 'system', label: t.system },
          { value: 'light', label: t.light },
          { value: 'dark', label: t.dark },
        ]}
        onChange={interfacePreferences.setAppearance}
      />
      {state.storageError ? (
        <View style={{ padding: space.x5 }}>
          <Text variant="meta" tone="danger">
            {t.storageError}
          </Text>
        </View>
      ) : null}
    </>
  );
}
