import { useMemo, useRef, type ReactElement } from 'react';

import type { HostClient } from '../../../../apps/mobile/src/host/client.js';

import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { useHostLook } from './host-looks.js';
import type { BotHarnessTranslate } from './locale.js';
import { RemoteHostModels } from './remote-host-models.js';
import { HostDetails } from './connection-hosts.js';
import { HostLookSettings } from './host-look-settings.js';
import { OverviewMemoryView } from './overview-memory-view.js';
import { OverviewUsageView } from './overview-usage-view.js';
import { remoteHostSettingsSource } from './remote-host-settings-source.js';
import { RemoteNotificationSettings } from './remote-notification-settings.js';
import { remoteHostActions, remoteHostSettings } from './remote-host-actions.js';
import { AutoApprovalSection, PromptsSection, VoiceSection } from './bot-settings-sections.js';
import { useMountedResource } from './mounted-resource.js';
import { StorageSettings } from './storage-settings.js';
import type { RemoteHosts } from './remote-hosts.js';
import { TargetName } from './target-name.js';

export type SettingsEnvironments = Pick<
  RemoteHosts,
  'getSnapshot' | 'subscribe' | 'client' | 'notifications'
>;

export interface SettingsEnvironmentOption {
  readonly hostId: string;
  readonly name: string;
}

export function EnvironmentSwitcher({
  here,
  remotes,
  value,
  onChange,
  t,
}: {
  here: SettingsEnvironmentOption;
  remotes: readonly SettingsEnvironmentOption[];
  value: string;
  onChange: (hostId: string) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <Select
      label={t('environment.settings.target')}
      value={value}
      options={[here, ...remotes].map((option) => ({
        value: option.hostId,
        label: <TargetName hostId={option.hostId} name={option.name} />,
      }))}
      onChange={(hostId) => {
        if (hostId !== value) onChange(hostId);
      }}
    />
  );
}

export const REMOTE_SETTINGS_SECTIONS = {
  hostModels: 'environment-models',
  hostAppearance: 'environment-appearance',
  hostNotifications: 'environment-notifications',
  hostApprovals: 'environment-approvals',
  hostPrompts: 'environment-prompts',
  hostVoice: 'environment-voice',
  hostUsage: 'environment-usage',
  hostStorage: 'environment-storage',
  hostConnections: 'environment-connections',
} as const;

export type RemoteSettingsSection =
  (typeof REMOTE_SETTINGS_SECTIONS)[keyof typeof REMOTE_SETTINGS_SECTIONS];

export const REMOTE_SECTION_ICONS: Readonly<Record<RemoteSettingsSection, string>> = {
  [REMOTE_SETTINGS_SECTIONS.hostModels]: 'cpu',
  [REMOTE_SETTINGS_SECTIONS.hostAppearance]: 'paintbrush',
  [REMOTE_SETTINGS_SECTIONS.hostNotifications]: 'bell',
  [REMOTE_SETTINGS_SECTIONS.hostApprovals]: 'shield-check',
  [REMOTE_SETTINGS_SECTIONS.hostPrompts]: 'file-text',
  [REMOTE_SETTINGS_SECTIONS.hostVoice]: 'audio-lines',
  [REMOTE_SETTINGS_SECTIONS.hostUsage]: 'gauge',
  [REMOTE_SETTINGS_SECTIONS.hostStorage]: 'files',
  [REMOTE_SETTINGS_SECTIONS.hostConnections]: 'plug',
};

export function remoteSettingsRows(
  t: BotHarnessTranslate,
): readonly { id: RemoteSettingsSection; order: number; label: string }[] {
  return [
    {
      id: REMOTE_SETTINGS_SECTIONS.hostModels,
      label: t('remoteHosts.settings.models'),
    },
    {
      id: REMOTE_SETTINGS_SECTIONS.hostApprovals,
      label: t('botSettings.section.autoApproval'),
    },
    { id: REMOTE_SETTINGS_SECTIONS.hostPrompts, label: t('botSettings.section.prompts') },
    { id: REMOTE_SETTINGS_SECTIONS.hostVoice, label: t('botSettings.section.voice') },
    {
      id: REMOTE_SETTINGS_SECTIONS.hostAppearance,
      label: t('environment.settings.appearance'),
    },
    {
      id: REMOTE_SETTINGS_SECTIONS.hostNotifications,
      label: t('remoteHosts.notifications'),
    },
    { id: REMOTE_SETTINGS_SECTIONS.hostUsage, label: t('overviewUsage.title') },
    { id: REMOTE_SETTINGS_SECTIONS.hostStorage, label: t('storage.title') },
    {
      id: REMOTE_SETTINGS_SECTIONS.hostConnections,
      label: t('connections.remote.title'),
    },
  ].map((row, order) => ({ ...row, order }));
}

export const REMOTE_DEVICE_SECTIONS: ReadonlySet<string> = new Set([
  REMOTE_SETTINGS_SECTIONS.hostAppearance,
  REMOTE_SETTINGS_SECTIONS.hostNotifications,
]);

export function isRemoteSettingsSection(id: string): id is RemoteSettingsSection {
  return Object.hasOwn(REMOTE_SECTION_ICONS, id);
}

export function RemoteEnvironmentSection({
  environments,
  hostId,
  name,
  section,
  t,
}: {
  environments: SettingsEnvironments;
  hostId: string;
  name: string;
  section: RemoteSettingsSection;
  t: BotHarnessTranslate;
}): ReactElement {
  const remote = environments.getSnapshot().hosts.find((entry) => entry.host.hostId === hostId);
  const client = environments.client(hostId);
  const retained = useRef({ hostId, client });
  if (retained.current.hostId !== hostId || client !== undefined)
    retained.current = { hostId, client };
  const shownClient = client ?? retained.current.client;
  const displayName = shownHostName(useHostLook(hostId), name);
  const connected = remote?.snapshot.connection.status === 'connected' && client !== undefined;
  const offline = (
    <Note tone="danger">
      {t(
        remote === undefined
          ? 'environment.settings.disconnected'
          : remote.snapshot.connection.status === 'refused'
            ? 'remoteHosts.refused'
            : 'remoteHosts.offline',
        { name: displayName },
      )}
    </Note>
  );
  if (section === REMOTE_SETTINGS_SECTIONS.hostAppearance)
    return <HostLookSettings key={hostId} hostId={hostId} name={name} available t={t} />;
  if (section === REMOTE_SETTINGS_SECTIONS.hostNotifications)
    return (
      <RemoteNotificationSettings
        key={hostId}
        hostId={hostId}
        notifications={environments.notifications}
        t={t}
      />
    );
  if (section === REMOTE_SETTINGS_SECTIONS.hostConnections)
    return remote === undefined ? offline : <HostDetails key={hostId} remote={remote} t={t} />;
  if (section === REMOTE_SETTINGS_SECTIONS.hostModels) {
    if (shownClient === undefined) return offline;
    return (
      <>
        {connected ? null : offline}
        <RemoteHostModels
          key={hostId}
          hostId={hostId}
          client={shownClient}
          available={connected}
          t={t}
        />
      </>
    );
  }
  if (!connected || client === undefined) return offline;
  return <RemoteHostData key={hostId} client={client} name={displayName} section={section} t={t} />;
}

export function LocalHostAppearance({
  hostId,
  name,
  t,
}: {
  hostId: string | undefined;
  name: string;
  t: BotHarnessTranslate;
}): ReactElement {
  if (hostId === undefined) return <Note>{t('environment.settings.loadingIdentity')}</Note>;
  return <HostLookSettings key={hostId} hostId={hostId} name={name} available t={t} />;
}

function RemoteHostApprovals({
  client,
  t,
}: {
  client: HostClient;
  t: BotHarnessTranslate;
}): ReactElement {
  const settings = remoteHostSettings(client);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const lifetime = new AbortController();
    void settings.actions.refreshRoster(lifetime.signal).catch(() => undefined);
    return () => lifetime.abort();
  }, [settings]);
  return (
    <div ref={mount}>
      <AutoApprovalSection
        actions={settings.actions}
        call={settings.call}
        store={settings.store}
        t={t}
      />
    </div>
  );
}

function RemoteHostData({
  client,
  name,
  section,
  t,
}: {
  client: HostClient;
  name: string;
  section: RemoteSettingsSection;
  t: BotHarnessTranslate;
}): ReactElement {
  const source = useMemo(() => remoteHostSettingsSource(client), [client]);
  if (section === REMOTE_SETTINGS_SECTIONS.hostApprovals)
    return <RemoteHostApprovals client={client} t={t} />;
  if (section === REMOTE_SETTINGS_SECTIONS.hostPrompts)
    return <PromptsSection actions={remoteHostActions(client)} t={t} />;
  if (section === REMOTE_SETTINGS_SECTIONS.hostVoice)
    return <VoiceSection actions={remoteHostActions(client)} t={t} />;
  if (section === REMOTE_SETTINGS_SECTIONS.hostStorage)
    return (
      <StorageSettings
        source={source.storage}
        title={t('remoteHosts.settings.storageTitle', { name })}
        t={t}
      />
    );
  return (
    <>
      <OverviewUsageView actions={source.usage} t={t} />
      <OverviewMemoryView actions={source.usage} t={t} />
    </>
  );
}
