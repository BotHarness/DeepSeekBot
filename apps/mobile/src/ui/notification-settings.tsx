import { useCallback, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';

import {
  PUSH_KINDS,
  PushRequestFailed,
  type PushKind,
  type PushPreferences,
  type PushSettings,
} from '../host/push';
import type { PushStatus } from '../host/push-session';
import { radius, space } from './design/tokens';
import { useDesignTheme } from './design/theme';
import { useMounted } from './mounted';
import { ActionButton, Loading, Notice, errorText } from './request-parts';
import { t } from './strings';

export interface NotificationSettingsPort {
  load(): Promise<PushSettings>;
  set(preferences: Partial<PushPreferences>): Promise<PushSettings>;
  test(): Promise<void>;
}

function failure(error: unknown): string {
  return error instanceof PushRequestFailed ? t.pushFailed[error.code] : errorText(error);
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
  const mount = useMounted<ScrollView>(() => {
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
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.color.base }}
      contentContainerStyle={{ padding: space.x5, gap: space.x5 }}
    >
      <Text
        style={{
          color: theme.color.muted,
          fontSize: theme.type.meta.size,
          lineHeight: theme.type.meta.line,
        }}
      >
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
        <View style={{ gap: space.x3 }}>
          <Text
            accessibilityRole="header"
            style={{
              color: theme.color.muted,
              fontSize: theme.type.meta.size,
              lineHeight: theme.type.meta.line,
              fontWeight: theme.weight.strong,
            }}
          >
            {t.notifyAbout}
          </Text>
          <View
            style={{
              backgroundColor: theme.color.surface,
              borderRadius: radius.md,
              paddingHorizontal: space.x5,
            }}
          >
            {PUSH_KINDS.map((kind) => (
              <View
                key={kind}
                style={{
                  minHeight: theme.touch,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: space.x4,
                }}
              >
                <Text
                  style={{
                    color: theme.color.fg,
                    fontSize: theme.type.body.size,
                    lineHeight: theme.type.body.line,
                    flexShrink: 1,
                  }}
                >
                  {t.pushKind[kind]}
                </Text>
                <Switch
                  accessibilityLabel={t.pushKind[kind]}
                  value={settings.preferences[kind]}
                  onValueChange={(value) => toggle(kind, value)}
                  disabled={!settings.registered}
                  trackColor={{ true: theme.color.accent, false: theme.color.borderStrong }}
                />
              </View>
            ))}
          </View>
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
