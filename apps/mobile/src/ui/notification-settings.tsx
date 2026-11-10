import { useCallback, useState, type ReactNode } from 'react';
import { AccessibilityInfo, View, type ViewInstance } from 'react-native';

import {
  PUSH_KINDS,
  PushRequestFailed,
  type PushDelivery,
  type PushKind,
  type PushPreferences,
  type PushSettings,
} from '../host/push';
import type { PushStatus } from '../host/push-session';
import type { DevicePreferenceSnapshot } from '../host/device-notification-preferences';
import { useMounted } from './mounted';
import { SettingsForm } from './primitives/settings-form';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { PreferenceRow } from './primitives/preference-row';
import { errorText } from './request-parts';
import { useStrings, t } from './strings';

export interface NotificationSettingsPort {
  load(): Promise<PushSettings>;
  set(preferences: Partial<PushPreferences>): Promise<PushSettings | void>;
  setEnabled(enabled: boolean): Promise<PushSettings>;
  setDelivery(delivery: PushDelivery): Promise<PushSettings>;
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
  connectionSettings,
}: {
  status: PushStatus;
  hostName: string;
  port: NotificationSettingsPort;
  preference?: DevicePreferenceSnapshot;
  onEnable(): void;
  onOpenSettings(): void;
  connectionSettings?: ReactNode;
}) {
  const t = useStrings();
  const [settings, setSettings] = useState<PushSettings | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [test, setTest] = useState<
    { state: 'sending' | 'sent' | 'seen' } | { state: 'failed'; error: string }
  >();
  const on = status.status === 'on';

  const reportFailure = useCallback((reason: unknown) => {
    const message = failure(reason);
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  }, []);
  const load = useCallback(() => {
    setError(undefined);
    port.load().then(setSettings, reportFailure);
  }, [port, reportFailure]);
  const mount = useMounted<ViewInstance>(() => {
    load();
  }, [on, load]);

  const toggle = (kind: PushKind, value: boolean) => {
    if (settings === undefined && preference?.preferences === undefined) return;
    if (settings === undefined) {
      void port.set({ [kind]: value }).catch(reportFailure);
      return;
    }
    setSettings({ ...settings, preferences: { ...settings.preferences, [kind]: value } });
    port.set({ [kind]: value }).then(
      (next) => {
        if (next !== undefined) setSettings(next);
      },
      (reason: unknown) => {
        reportFailure(reason);
        load();
      },
    );
  };

  const deliver = (mode: PushDelivery | 'off') => {
    if (settings === undefined) return;
    const enabled = mode !== 'off';
    const delivery = mode === 'off' ? settings.delivery : mode;
    setSettings({ ...settings, enabled, delivery });
    const save = async () => {
      let next = settings;
      if (next.enabled !== enabled) next = await port.setEnabled(enabled);
      if (enabled && next.delivery !== delivery) next = await port.setDelivery(delivery);
      return next;
    };
    save().then(setSettings, (reason: unknown) => {
      reportFailure(reason);
      load();
    });
  };

  const sendTest = () => {
    setTest({ state: 'sending' });
    port.test().then(
      () => {
        setTest({ state: 'sent' });
        AccessibilityInfo.announceForAccessibility(t.testSent);
      },
      (reason: unknown) => {
        const error = failure(reason);
        setTest({ state: 'failed', error });
        AccessibilityInfo.announceForAccessibility(`${t.testFailed} ${error}`);
      },
    );
  };

  const hostFailed = on && status.failed.length > 0 && settings?.registered !== true;

  return (
    <View ref={mount} style={{ flex: 1 }}>
      <SettingsForm testID="notification-settings">
        {connectionSettings}
        {on && settings !== undefined ? (
          <SettingsSection on="raised">
            <SettingsRow
              on="raised"
              title={t.notificationCloudRegistration}
              detail={settings.registered ? t.notificationRegistered : t.notificationNotRegistered}
            />
          </SettingsSection>
        ) : null}
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
            <SettingsRow
              on="raised"
              title={
                status.reason === 'missing-project-id'
                  ? t.cloudPushUnavailable
                  : t.notificationsRegistrationFailed
              }
            />
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
            footer={
              !settings.enabled
                ? t.allowNotificationsOff
                : settings.delivery === 'in-app'
                  ? t.deliveryInAppHint
                  : t.deliveryPushHint
            }
          >
            {settings.registered ? (
              <PreferenceRow
                on="raised"
                title={t.deliveryTitle}
                icon="notifications"
                testID="notifications-delivery"
                value={settings.enabled ? settings.delivery : 'off'}
                options={[
                  { value: 'push', label: t.deliveryPush, icon: 'notifications' },
                  { value: 'in-app', label: t.deliveryInApp, icon: 'system' },
                  { value: 'off', label: t.deliveryOff, icon: 'unpair' },
                ]}
                onChange={deliver}
              />
            ) : (
              <SettingsRow
                on="raised"
                title={t.deliveryTitle}
                detail={
                  !settings.enabled
                    ? t.deliveryOff
                    : settings.delivery === 'in-app'
                      ? t.deliveryInApp
                      : t.deliveryPush
                }
              />
            )}
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
                  testID: `notifications-kind-${kind}`,
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
              detail={
                test?.state === 'seen'
                  ? t.notificationLocalTestState.seen
                  : test?.state === 'sent'
                    ? t.testSent
                    : undefined
              }
              control={test?.state === 'sending' ? { kind: 'busy' } : undefined}
            />
            {test?.state === 'sent' ? (
              <SettingsRow
                on="raised"
                title={t.notificationSawTest}
                testID="notification-cloud-test-seen"
                onPress={() => setTest({ state: 'seen' })}
              />
            ) : null}
          </SettingsSection>
        ) : null}
      </SettingsForm>
    </View>
  );
}
