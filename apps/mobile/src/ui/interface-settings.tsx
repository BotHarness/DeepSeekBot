import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { interfacePreferences } from './interface-preferences';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { PreferenceRow } from './primitives/preference-row';
import { Button } from './primitives/button';
import { SettingsFormItem } from './primitives/settings-form';
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
        { value: 'system', label: t.system, icon: 'system' },
        { value: 'zh', label: '简体中文', icon: 'language' },
        { value: 'en', label: 'English', icon: 'language' },
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
        { value: 'system', label: t.system, icon: 'system' },
        { value: 'light', label: t.light, icon: 'light' },
        { value: 'dark', label: t.dark, icon: 'dark' },
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
    <SettingsFormItem>
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
    </SettingsFormItem>
  );
}

export function SessionsTabSetting({ on = 'sheet' }: { on?: LayerName }) {
  const t = useStrings().hostSessions;
  const state = usePreferences();
  return (
    <SettingsRow
      on={on}
      title={t.toggle}
      icon="sessions"
      control={{
        kind: 'switch',
        value: state.sessionsTab,
        onChange: interfacePreferences.setSessionsTab,
        disabled: !state.loaded,
        testID: 'sessions-tab-toggle',
      }}
    />
  );
}

export function HideBarsSetting({ on = 'sheet' }: { on?: LayerName }) {
  const t = useStrings().hideBars;
  const state = usePreferences();
  return (
    <SettingsRow
      on={on}
      title={t.title}
      icon="scrollBars"
      detail={t.detail}
      control={{
        kind: 'switch',
        value: state.hideBarsOnScroll,
        onChange: interfacePreferences.setHideBarsOnScroll,
        disabled: !state.loaded,
        testID: 'hide-bars-toggle',
      }}
    />
  );
}

export function SessionNavigationSettings({ on = 'sheet' }: { on?: LayerName }) {
  const t = useStrings().hostSessions.navigation;
  const state = usePreferences();
  if (!state.sessionsTab) return null;
  return (
    <SettingsSection title={t.section} on={on} footer={t.footer}>
      <PreferenceRow
        on={on}
        title={t.style}
        icon="sessions"
        testID="settings-session-navigation"
        value={state.sessionNavigation}
        options={[
          { value: 'drawer', label: t.drawer, icon: 'drawer' },
          { value: 'stacked', label: t.stacked, icon: 'stacked' },
        ]}
        onChange={interfacePreferences.setSessionNavigation}
      />
      <PreferenceRow
        on={on}
        title={t.launch}
        icon="open"
        testID="settings-session-launch"
        value={state.sessionLaunch}
        options={[
          { value: 'new', label: t.newSession, icon: 'newSession' },
          { value: 'list', label: t.list, icon: 'list' },
          { value: 'last', label: t.last, icon: 'history' },
        ]}
        onChange={interfacePreferences.setSessionLaunch}
      />
      <PreferenceRow
        on={on}
        title={t.returning}
        icon="history"
        testID="settings-session-return"
        value={state.sessionReturn}
        options={[
          { value: 'stay', label: t.stay, icon: 'stay' },
          { value: 'new', label: t.newSession, icon: 'newSession' },
          { value: 'list', label: t.list, icon: 'list' },
        ]}
        onChange={interfacePreferences.setSessionReturn}
      />
    </SettingsSection>
  );
}
