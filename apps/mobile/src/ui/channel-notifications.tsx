import { useCallback, useState } from 'react';
import { ScrollView, type ScrollViewInstance } from 'react-native';

import { PushRequestFailed, type PushSettings } from '../host/push';
import type { PushStatus } from '../host/push-session';
import { space } from './design/tokens';
import { useDesignTheme } from './design/theme';
import { useMounted } from './mounted';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { Loading, Notice, errorText } from './request-parts';
import { useStrings, t } from './strings';

export interface ChannelNotificationsPort {
  load(): Promise<PushSettings>;
  setQuiet(quiet: boolean): Promise<PushSettings>;
  setHostMuted(muted: boolean): Promise<void>;
}

function failure(error: unknown): string {
  return error instanceof PushRequestFailed ? t.pushFailed[error.code] : errorText(error);
}

export function ChannelNotifications({
  status,
  channelId,
  hostMuted,
  port,
}: {
  status: PushStatus;
  channelId: string;
  hostMuted: boolean;
  port: ChannelNotificationsPort;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [settings, setSettings] = useState<PushSettings | undefined>();
  const [muted, setMuted] = useState<boolean | undefined>();
  const [error, setError] = useState<string | undefined>();
  const on = status.status === 'on';
  const host = muted ?? hostMuted;

  const load = useCallback(() => {
    setError(undefined);
    port.load().then(setSettings, (reason: unknown) => setError(failure(reason)));
  }, [port]);
  const mount = useMounted<ScrollViewInstance>(() => {
    if (on) load();
  }, [on, load]);

  const quiet = (value: boolean) => {
    if (settings === undefined) return;
    const others = settings.quietChannelIds.filter((id) => id !== channelId);
    setSettings({ ...settings, quietChannelIds: value ? [...others, channelId] : others });
    port.setQuiet(value).then(setSettings, (reason: unknown) => {
      setError(failure(reason));
      load();
    });
  };

  const mute = (value: boolean) => {
    setMuted(value);
    setError(undefined);
    port.setHostMuted(value).then(
      () => setMuted(undefined),
      (reason: unknown) => {
        setMuted(undefined);
        setError(failure(reason));
      },
    );
  };

  const active = on && settings?.registered === true && settings.enabled;
  const quietHere = settings?.quietChannelIds.includes(channelId) === true;

  return (
    <ScrollView
      ref={mount}
      nestedScrollEnabled
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.overlay.fill }}
      contentContainerStyle={{ padding: space.x5, gap: space.x5 }}
    >
      {status.status === 'checking' ? <Loading /> : null}
      {status.status !== 'on' && status.status !== 'checking' ? (
        <Notice tone="warning">{t.channelNotifications.pushOff}</Notice>
      ) : null}
      {on && settings?.enabled === false ? (
        <Notice tone="warning">{t.channelNotifications.allOff}</Notice>
      ) : null}
      {error !== undefined ? <Notice tone="danger">{error}</Notice> : null}
      {on && settings === undefined && error === undefined ? <Loading /> : null}
      <SettingsSection
        on="raised"
        footer={
          host ? t.channelNotifications.quietByHost : t.channelNotifications.quietHereFootnote
        }
      >
        <SettingsRow
          on="raised"
          title={t.channelNotifications.quietHere}
          control={{
            kind: 'switch',
            value: host || quietHere,
            onChange: quiet,
            disabled: host || !active,
          }}
        />
      </SettingsSection>
      <SettingsSection on="raised" footer={t.channelNotifications.muteHostFootnote}>
        <SettingsRow
          on="raised"
          title={t.channelNotifications.muteHost}
          control={{ kind: 'switch', value: host, onChange: mute, disabled: muted !== undefined }}
        />
      </SettingsSection>
    </ScrollView>
  );
}
