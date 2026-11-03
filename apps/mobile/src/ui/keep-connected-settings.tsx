import { useState, useSyncExternalStore } from 'react';
import { AppState, Linking, View, type ViewInstance } from 'react-native';
import * as Notifications from 'expo-notifications';

import { connectionMode, notificationDiagnostics } from '../host/native-connection-mode';
import type { ConnectionSummary } from '../host/connection-summary';
import { NotificationDiagnosticsSettings } from './notification-diagnostics-settings';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { useStrings } from './strings';
import { useMounted } from './mounted';
import { space } from './design/tokens';

export function KeepConnectedSettings({ summary }: { summary: ConnectionSummary }) {
  const t = useStrings();
  const state = useSyncExternalStore(connectionMode.subscribe, connectionMode.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [permission, setPermission] = useState<Notifications.NotificationPermissionsStatus>();
  const mount = useMounted<ViewInstance>(() => {
    if (!connectionMode.supported) return;
    const read = () => {
      void Notifications.getPermissionsAsync().then(setPermission, () => setFailed(true));
    };
    read();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') read();
    });
    return () => subscription.remove();
  }, []);
  if (!connectionMode.supported) return null;
  const toggle = (enabled: boolean) => {
    setBusy(true);
    setFailed(false);
    void connectionMode
      .setEnabled(enabled)
      .then(() => notificationDiagnostics.dismissSetup())
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };
  return (
    <View ref={mount} style={{ gap: space.x6 }}>
      <SettingsSection
        on="raised"
        footer={
          state.error === 'alert-sync-failed'
            ? t.localAlertsFailed
            : failed || state.error
              ? t.keepConnectedFailed
              : t.keepConnectedHint
        }
      >
        <SettingsRow
          on="raised"
          title={t.keepConnected}
          detail={
            state.enabled
              ? state.running
                ? t.keepConnectedRunning
                : t.keepConnectedStarting
              : undefined
          }
          control={{
            kind: 'switch',
            value: state.enabled,
            onChange: toggle,
            disabled: busy,
            testID: 'keep-connected',
          }}
          testID="keep-connected"
        />
      </SettingsSection>
      {permission !== undefined && !permission.granted ? (
        <SettingsSection on="raised" footer={t.localNotificationsDenied}>
          <SettingsRow
            on="raised"
            title={permission.canAskAgain ? t.turnOnNotifications : t.openSettings}
            testID="local-notifications-permission"
            onPress={() => {
              if (permission.canAskAgain)
                void Notifications.requestPermissionsAsync().then(setPermission, () =>
                  setFailed(true),
                );
              else void Linking.openSettings();
            }}
          />
        </SettingsSection>
      ) : null}
      <NotificationDiagnosticsSettings
        port={notificationDiagnostics}
        enabled={state.enabled}
        running={state.running}
        summary={summary}
      />
    </View>
  );
}
