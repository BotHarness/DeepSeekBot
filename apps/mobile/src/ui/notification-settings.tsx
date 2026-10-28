import { useCallback, useEffect, useState } from 'react';

import {
  PUSH_KINDS,
  PushRequestFailed,
  type PushKind,
  type PushPreferences,
  type PushSettings,
} from '../host/push';
import type { PushStatus } from '../host/push-session';
import type { DevicePreferenceSnapshot } from '../host/device-notification-preferences';
import { SettingsForm } from './primitives/settings-form';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { errorText } from './request-parts';
import { useStrings, t } from './strings';

export interface NotificationSettingsPort {
  load(): Promise<PushSettings>;
  set(preferences: Partial<PushPreferences>): Promise<PushSettings | void>;
  setEnabled(enabled: boolean): Promise<PushSettings>;
  test(): Promise<void>;
}

function failure(error: unknown): string {
  return error instanceof PushRequestFailed ? t.pushFailed[error.code] : errorText(error);
}

export function NotificationSettings({
  status,
  hostName,
  port,
  preference,
  onEnable,
  onOpenSettings,
}: {
  status: PushStatus;
  hostName: string;
  port: NotificationSettingsPort;
  preference?: DevicePreferenceSnapshot;
  onEnable(): void;
  onOpenSettings(): void;
}) {
  const t = useStrings();
  const [settings, setSettings] = useState<PushSettings | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [test, setTest] = useState<
    { state: 'sending' | 'sent' } | { state: 'failed'; error: string }
  >();
  const on = status.status === 'on';

  const load = useCallback(() => {
    setError(undefined);
    port.load().then(setSettings, (reason: unknown) => setError(failure(reason)));
  }, [port]);
  useEffect(() => {
    load();
  }, [on, load]);

  const toggle = (kind: PushKind, value: boolean) => {
    if (settings === undefined && preference?.preferences === undefined) return;
    if (settings === undefined) {
      void port.set({ [kind]: value }).catch((reason: unknown) => setError(failure(reason)));
      return;
    }
    setSettings({ ...settings, preferences: { ...settings.preferences, [kind]: value } });
    port.set({ [kind]: value }).then(
      (next) => {
        if (next !== undefined) setSettings(next);
      },
      (reason: unknown) => {
        setError(failure(reason));
        load();
      },
    );
  };

  const allow = (enabled: boolean) => {
    if (settings === undefined) return;
    setSettings({ ...settings, enabled });
    port.setEnabled(enabled).then(setSettings, (reason: unknown) => {
      setError(failure(reason));
      load();
    });
  };

  const sendTest = () => {
    setTest({ state: 'sending' });
    port.test().then(
      () => setTest({ state: 'sent' }),
      (reason: unknown) => setTest({ state: 'failed', error: failure(reason) }),
    );
  };

  const hostFailed = on && status.failed.length > 0 && settings?.registered !== true;

  return (
    <SettingsForm testID="notification-settings">
      {status.status === 'checking' || (on && settings === undefined && error === undefined) ? (
        <SettingsSection on="raised">
          <SettingsRow title={t.loading} on="raised" control={{ kind: 'busy' }} />
        </SettingsSection>
      ) : null}
      {status.status === 'off' ? (
        <SettingsSection on="raised" footer={t.notificationsOff}>
          <SettingsRow
            on="raised"
            title={t.turnOnNotifications}
            onPress={onEnable}
            testID="notifications-enable"
          />
        </SettingsSection>
      ) : null}
      {status.status === 'denied' ? (
        <SettingsSection on="raised" footer={t.notificationsDenied}>
          <SettingsRow
            on="raised"
            title={t.openSettings}
            onPress={onOpenSettings}
            testID="notifications-open-settings"
          />
        </SettingsSection>
      ) : null}
      {status.status === 'unavailable' ? (
        <SettingsSection on="raised">
          <SettingsRow on="raised" title={t.notificationsUnavailable} />
        </SettingsSection>
      ) : null}
      {hostFailed ? (
        <SettingsSection on="raised">
          <SettingsRow on="raised" title={t.notificationsHostFailed(hostName)} />
        </SettingsSection>
      ) : null}
      {error !== undefined ? (
        <SettingsSection on="raised">
          <SettingsRow on="raised" title={error} tone="danger" />
        </SettingsSection>
      ) : null}
      {on && settings !== undefined ? (
        <SettingsSection
          on="raised"
          footer={settings.enabled ? undefined : t.allowNotificationsOff}
        >
          <SettingsRow
            on="raised"
            title={t.allowNotifications}
            testID="notifications-allow"
            control={{
              kind: 'switch',
              value: settings.enabled,
              onChange: allow,
              disabled: !settings.registered,
            }}
          />
        </SettingsSection>
      ) : null}
      {preference?.preferences !== undefined || (on && settings?.enabled === true) ? (
        <SettingsSection
          on="raised"
          title={t.notifyAbout}
          footer={preference?.failed.length ? t.notificationPreferencePending : undefined}
        >
          {PUSH_KINDS.map((kind) => (
            <SettingsRow
              on="raised"
              key={kind}
              title={t.pushKind[kind]}
              testID={`notifications-kind-${kind}`}
              control={{
                kind: 'switch',
                value: (preference?.preferences ?? settings!.preferences)[kind],
                onChange: (value) => toggle(kind, value),
                disabled: preference?.preferences === undefined && !settings?.registered,
              }}
            />
          ))}
        </SettingsSection>
      ) : null}
      {on && settings?.registered && settings.enabled ? (
        <SettingsSection
          on="raised"
          footer={test?.state === 'failed' ? `${t.testFailed} ${test.error}` : undefined}
        >
          <SettingsRow
            on="raised"
            title={t.sendTest}
            testID="notifications-test"
            onPress={test?.state === 'sending' ? undefined : sendTest}
            detail={test?.state === 'sent' ? t.testSent : undefined}
            control={test?.state === 'sending' ? { kind: 'busy' } : undefined}
          />
        </SettingsSection>
      ) : null}
    </SettingsForm>
  );
}
