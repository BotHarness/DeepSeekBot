import { useSyncExternalStore } from 'react';
import { interfacePreferences } from './interface-preferences';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { useStrings } from './strings';
import { PreferenceRow } from './primitives/preference-row';

export function InAppNotificationSettings() {
  const state = useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
  );
  const t = useStrings();
  return (
    <SettingsSection on="raised" footer={t.inAppAlertsHint}>
      <SettingsRow
        on="raised"
        title={t.inAppAlerts}
        control={{
          kind: 'switch',
          value: state.inAppAlerts,
          onChange: interfacePreferences.setInAppAlerts,
          testID: 'in-app-alerts-toggle',
        }}
      />
      <PreferenceRow
        on="raised"
        title={t.inAppAlertStyle}
        icon="notifications"
        testID="in-app-alert-style"
        value={state.inAppAlertStyle}
        options={[
          { value: 'inline', label: t.inAppAlertInline, icon: 'notifications' },
          { value: 'overlay', label: t.inAppAlertOverlay, icon: 'notifications' },
        ]}
        onChange={interfacePreferences.setInAppAlertStyle}
      />
      {state.storageError ? (
        <SettingsRow
          on="raised"
          title={t.interfacePreferences.storageError}
          onPress={interfacePreferences.retrySave}
          testID="in-app-alerts-retry-save"
        />
      ) : null}
    </SettingsSection>
  );
}
