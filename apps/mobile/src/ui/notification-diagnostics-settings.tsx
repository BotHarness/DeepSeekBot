import { useState } from 'react';
import { AppState, Linking, View, type ViewInstance } from 'react-native';

import type {
  NotificationDiagnostics,
  NotificationDiagnosticsPort,
  LocalTestResult,
} from '../host/notification-diagnostics';
import type { ConnectionSummary } from '../host/connection-summary';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { useMounted } from './mounted';
import { locale, useStrings } from './strings';
import { space } from './design/tokens';

export function NotificationDiagnosticsSettings({
  port,
  enabled,
  running,
  summary,
}: {
  port: NotificationDiagnosticsPort;
  enabled: boolean;
  running: boolean;
  summary: ConnectionSummary;
}) {
  const t = useStrings();
  const [diagnostics, setDiagnostics] = useState<NotificationDiagnostics>();
  const [failed, setFailed] = useState(false);
  const [test, setTest] = useState<LocalTestResult | 'sending' | 'failed' | 'seen'>();
  const [help, setHelp] = useState(false);
  const mount = useMounted<ViewInstance>(() => {
    let disposed = false;
    let generation = 0;
    const read = () => {
      const current = ++generation;
      void port.read().then(
        (next) => {
          if (disposed || current !== generation) return;
          setDiagnostics(next);
          setFailed(false);
        },
        () => {
          if (disposed || current !== generation) return;
          setDiagnostics(undefined);
          setFailed(true);
        },
      );
    };
    read();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') read();
    });
    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [port]);
  const dismiss = () => {
    void port.dismissSetup().then(
      () => {
        setDiagnostics((current) => current && { ...current, setupDismissed: true });
      },
      () => setFailed(true),
    );
  };
  const send = () => {
    setTest('sending');
    void port.test(locale).then(setTest, () => setTest('failed'));
  };
  const openSettings = () => {
    void Linking.openSettings().catch(() => setFailed(true));
  };
  return (
    <View ref={mount} style={{ gap: space.x6 }}>
      {diagnostics && !diagnostics.setupDismissed && !enabled ? (
        <SettingsSection on="raised" footer={t.notificationSetupHint}>
          <SettingsRow
            on="raised"
            title={t.notificationSetupLater}
            testID="notification-setup-later"
            onPress={dismiss}
          />
        </SettingsSection>
      ) : null}
      <SettingsSection
        on="raised"
        title={t.notificationHealth}
        footer={failed ? t.notificationHealthFailed : t.notificationHealthHint}
      >
        <SettingsRow
          on="raised"
          title={t.notificationMode}
          detail={enabled ? t.notificationOn : t.notificationOff}
        />
        <SettingsRow
          on="raised"
          title={t.notificationService}
          detail={running ? t.keepConnectedRunning : t.notificationStopped}
        />
        <SettingsRow
          on="raised"
          title={t.notificationConnections}
          detail={t.notificationCounts(summary.connected, summary.hosts)}
        />
        <SettingsRow
          on="raised"
          title={t.notificationSynced}
          detail={t.notificationCounts(summary.synced, summary.hosts)}
        />
        <SettingsRow
          on="raised"
          title={t.notificationSystemPermission}
          detail={
            diagnostics
              ? diagnostics.permission
                ? t.notificationAllowed
                : t.notificationBlocked
              : t.notificationUnknown
          }
        />
        <SettingsRow
          on="raised"
          title={t.notificationRequestChannel}
          detail={
            diagnostics ? t.notificationChannelState[diagnostics.requests] : t.notificationUnknown
          }
        />
        <SettingsRow
          on="raised"
          title={t.notificationConnectionChannel}
          detail={
            diagnostics ? t.notificationChannelState[diagnostics.connection] : t.notificationUnknown
          }
        />
        <SettingsRow
          on="raised"
          title={t.openSettings}
          testID="notification-health-settings"
          onPress={openSettings}
        />
      </SettingsSection>
      <SettingsSection on="raised" footer={t.notificationLocalTestHint}>
        <SettingsRow
          on="raised"
          title={t.notificationLocalTest}
          testID="notification-local-test"
          onPress={test === 'sending' ? undefined : send}
          detail={test ? t.notificationLocalTestState[test] : undefined}
          control={test === 'sending' ? { kind: 'busy' } : undefined}
        />
        {test === 'posted' ? (
          <SettingsRow
            on="raised"
            title={t.notificationSawTest}
            testID="notification-local-test-seen"
            onPress={() => setTest('seen')}
          />
        ) : null}
      </SettingsSection>
      <SettingsSection on="raised" footer={help ? t.notificationBatteryHint : undefined}>
        <SettingsRow
          on="raised"
          title={t.notificationBatteryHelp}
          testID="notification-battery-help"
          onPress={() => setHelp(!help)}
        />
        {help ? (
          <>
            <SettingsRow
              on="raised"
              title={t.notificationBatteryOptimization}
              detail={
                diagnostics
                  ? diagnostics.batteryExempt
                    ? t.notificationBatteryExempt
                    : t.notificationBatteryManaged
                  : t.notificationUnknown
              }
            />
            <SettingsRow
              on="raised"
              title={t.notificationPowerSave}
              detail={
                diagnostics
                  ? diagnostics.powerSave
                    ? t.notificationOn
                    : t.notificationOff
                  : t.notificationUnknown
              }
            />
            <SettingsRow
              on="raised"
              title={t.notificationVendorLimits}
              detail={t.notificationVendorUnknown}
            />
          </>
        ) : null}
      </SettingsSection>
    </View>
  );
}
