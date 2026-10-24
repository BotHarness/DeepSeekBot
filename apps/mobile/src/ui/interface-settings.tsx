import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { interfacePreferences } from './interface-preferences';
import { PreferenceRow } from './primitives/preference-row';
import { Button } from './primitives/button';
import { Text } from './primitives/text';
import { space } from './design/tokens';
import type { LayerName } from './design/layers';
import { useStrings } from './strings';

function usePreferences() {
  return useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
    interfacePreferences.getSnapshot,
  );
}

export function LanguageSetting({ on = 'sheet' }: { on?: LayerName }) {
  const t = useStrings().interfacePreferences;
  const state = usePreferences();
  return (
    <PreferenceRow
      on={on}
      title={t.language}
      icon="language"
      testID="settings-language"
      value={state.language}
      options={[
        { value: 'system', label: t.system },
        { value: 'zh', label: '简体中文' },
        { value: 'en', label: 'English' },
      ]}
      onChange={interfacePreferences.setLanguage}
    />
  );
}

export function AppearanceSetting({ on = 'sheet' }: { on?: LayerName }) {
  const t = useStrings().interfacePreferences;
  const state = usePreferences();
  return (
    <PreferenceRow
      on={on}
      title={t.appearance}
      icon="appearance"
      testID="settings-appearance"
      value={state.appearance}
      options={[
        { value: 'system', label: t.system },
        { value: 'light', label: t.light },
        { value: 'dark', label: t.dark },
      ]}
      onChange={interfacePreferences.setAppearance}
    />
  );
}

export function InterfaceSaveNotice() {
  const copy = useStrings();
  const state = usePreferences();
  if (!state.storageError) return null;
  return (
    <View style={{ padding: space.x5, gap: space.x3 }}>
      <Text variant="meta" tone="danger">
        {copy.interfacePreferences.storageError}
      </Text>
      <Button
        label={copy.retry}
        testID="settings-interface-retry"
        onPress={interfacePreferences.retrySave}
      />
    </View>
  );
}
