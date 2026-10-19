import { useCallback, useState } from 'react';
import { Platform, ScrollView, Switch, View, type ScrollViewInstance } from 'react-native';

import {
  PUSH_KINDS,
  PushRequestFailed,
  type PushKind,
  type PushPreferences,
  type PushSettings,
} from '../host/push';
import type { PushStatus } from '../host/push-session';
import { space } from './design/tokens';
import { useDesignTheme } from './design/theme';
import { useMounted } from './mounted';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { Text } from './primitives/text';
import { Toggle } from './primitives/toggle';
import { ActionButton, Loading, Notice, errorText } from './request-parts';
import { t } from './strings';

export interface NotificationSettingsPort {
  load(): Promise<PushSettings>;
  set(preferences: Partial<PushPreferences>): Promise<PushSettings>;
  setEnabled(enabled: boolean): Promise<PushSettings>;
  test(): Promise<void>;
}

function failure(error: unknown): string {
  return error instanceof PushRequestFailed ? t.pushFailed[error.code] : errorText(error);
}

function PushSwitch({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange(value: boolean): void;
}) {
  const theme = useDesignTheme();
  return Platform.OS === 'android' ? (
    <Toggle on="raised" label={label} value={value} onChange={onChange} disabled={disabled} />
  ) : (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ true: theme.color.accent, false: theme.color.borderStrong }}
    />
  );
}

export function NotificationSettings({
  status,
  hostName,
  port,
  onEnable,
  onOpenSettings,
}: {
  status: PushStatus;
  hostName: string;
  port: NotificationSettingsPort;
  onEnable(): void;
  onOpenSettings(): void;
}) {
  const theme = useDesignTheme();
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
  const mount = useMounted<ScrollViewInstance>(() => {
    if (on) load();
  }, [on, load]);

  const toggle = (kind: PushKind, value: boolean) => {
    if (settings === undefined) return;
    setSettings({ ...settings, preferences: { ...settings.preferences, [kind]: value } });
    port.set({ [kind]: value }).then(setSettings, (reason: unknown) => {
      setError(failure(reason));
      load();
    });
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
    <ScrollView
      ref={mount}
      nestedScrollEnabled
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.overlay.fill }}
      contentContainerStyle={{ padding: space.x5, gap: space.x5 }}
    >
      <Text variant="meta" tone="muted">
        {t.notificationsHint}
      </Text>
      {status.status === 'checking' ? <Loading /> : null}
      {status.status === 'off' ? (
        <View style={{ gap: space.x4 }}>
          <Notice tone="warning">{t.notificationsOff}</Notice>
          <View style={{ flexDirection: 'row' }}>
            <ActionButton label={t.turnOnNotifications} onPress={onEnable} />
          </View>
        </View>
      ) : null}
      {status.status === 'denied' ? (
        <View style={{ gap: space.x4 }}>
          <Notice tone="warning">{t.notificationsDenied}</Notice>
          <View style={{ flexDirection: 'row' }}>
            <ActionButton label={t.openSettings} tone="secondary" onPress={onOpenSettings} />
          </View>
        </View>
      ) : null}
      {status.status === 'unavailable' ? (
        <Notice tone="danger">{t.notificationsUnavailable}</Notice>
      ) : null}
      {on ? (
        <Notice tone={hostFailed ? 'warning' : 'success'}>
          {hostFailed ? t.notificationsHostFailed(hostName) : t.notificationsOn(hostName)}
        </Notice>
      ) : null}
      {error !== undefined ? <Notice tone="danger">{error}</Notice> : null}
      {on && settings === undefined && error === undefined ? <Loading /> : null}
      {on && settings !== undefined ? (
        <SettingsSection
          on="raised"
          footer={settings.enabled ? undefined : t.allowNotificationsOff}
        >
          <SettingsRow
            on="raised"
            title={t.allowNotifications}
            trailing={
              <PushSwitch
                label={t.allowNotifications}
                value={settings.enabled}
                onChange={allow}
                disabled={!settings.registered}
              />
            }
          />
        </SettingsSection>
      ) : null}
      {on && settings?.enabled === true ? (
        <View style={{ gap: space.x3 }}>
          <Text accessibilityRole="header" variant="meta" tone="muted" strong>
            {t.notifyAbout}
          </Text>
          <SettingsSection on="raised">
            {PUSH_KINDS.map((kind) => (
              <SettingsRow
                on="raised"
                key={kind}
                title={t.pushKind[kind]}
                trailing={
                  <PushSwitch
                    label={t.pushKind[kind]}
                    value={settings.preferences[kind]}
                    onChange={(value) => toggle(kind, value)}
                    disabled={!settings.registered}
                  />
                }
              />
            ))}
          </SettingsSection>
          <View style={{ flexDirection: 'row', paddingTop: space.x3 }}>
            <ActionButton
              label={t.sendTest}
              tone="secondary"
              onPress={sendTest}
              busy={test?.state === 'sending'}
              disabled={!settings.registered}
            />
          </View>
          {test?.state === 'sent' ? <Notice tone="success">{t.testSent}</Notice> : null}
          {test?.state === 'failed' ? (
            <Notice tone="danger">{`${t.testFailed} ${test.error}`}</Notice>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}
