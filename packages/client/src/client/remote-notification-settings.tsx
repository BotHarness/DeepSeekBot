import { useState, useSyncExternalStore } from 'react';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import { PUSH_KINDS, type PushKind } from '../../../../apps/mobile/src/host/push.js';
import type { RemoteNotifications } from './remote-notifications.js';
import type { BotHarnessTranslate, BotHarnessKey } from './locale.js';
import { SettingsDialog } from './ds/settings-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';

const labels: Record<PushKind, BotHarnessKey> = {
  approval: 'remoteHosts.notifications.approval',
  question: 'remoteHosts.notifications.question',
  'private-input': 'remoteHosts.notifications.private',
  reply: 'remoteHosts.notifications.reply',
};

export function RemoteNotificationSettings({
  hostId,
  name,
  notifications,
  t,
  onClose,
}: {
  hostId: string;
  name: string;
  notifications: RemoteNotifications;
  t: BotHarnessTranslate;
  onClose(): void;
}) {
  const snapshot = useSyncExternalStore(notifications.subscribe, notifications.getSnapshot);
  const choice = notifications.choice(hostId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const set = (patch: Parameters<RemoteNotifications['set']>[1]) => {
    setBusy(true);
    setError(false);
    void notifications
      .set(hostId, patch)
      .catch(() => setError(true))
      .finally(() => setBusy(false));
  };
  return (
    <SettingsDialog
      title={t('remoteHosts.notifications.title', { name })}
      caption={t('remoteHosts.notifications.hint')}
      labels={{ close: t('common.close'), nav: name, picker: (section) => section }}
      sections={[{ id: 'notifications', label: t('remoteHosts.notifications.title', { name }) }]}
      activeId="notifications"
      onSelect={() => {}}
      onClose={() => {
        notifications.cancel(hostId);
        onClose();
      }}
    >
      {(error || snapshot.permission === 'denied' || snapshot.permission === 'unsupported') && (
        <Note tone="danger">
          {error
            ? t('remoteHosts.notifications.failed')
            : snapshot.permission === 'denied'
              ? t('remoteHosts.notifications.denied')
              : snapshot.permission === 'unsupported'
                ? t('remoteHosts.notifications.unsupported')
                : undefined}
        </Note>
      )}
      <SettingsSection>
        <SettingsRow
          title={t('remoteHosts.notifications.enable')}
          control={
            <Switch
              label={t('remoteHosts.notifications.enable')}
              checked={choice.enabled}
              onChange={(value) => set({ enabled: value })}
              disabled={
                busy ||
                (!choice.enabled &&
                  (snapshot.permission === 'unsupported' || snapshot.permission === 'denied'))
              }
            />
          }
        />
        {PUSH_KINDS.map((kind) => (
          <SettingsRow
            key={kind}
            title={t(labels[kind])}
            control={
              <Switch
                label={t(labels[kind])}
                checked={choice.preferences[kind]}
                disabled={busy}
                onChange={(value) => set({ preferences: { [kind]: value } })}
              />
            }
          />
        ))}
      </SettingsSection>
    </SettingsDialog>
  );
}
