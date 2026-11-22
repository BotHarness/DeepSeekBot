import { useMemo, useRef, useState, type ReactElement } from 'react';

import type { HostClient } from '@botharness/host-client/client';

import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import { Note } from './ds/note.js';
import { Button } from './ds/button.js';
import { Select } from './ds/select.js';
import { SettingsRow } from './ds/settings-row.js';
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
import { RemoteMessagingSettings } from './remote-messaging-settings.js';
import { StorageSettings } from './storage-settings.js';
import type { RemoteHosts } from './remote-hosts.js';
import { TargetName } from './target-name.js';
import { loadTeamMode, setOwnerPassword } from './team-bridge.js';
import { TeamOwnerPasswordDialog } from './team-settings.js';

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

export {
  REMOTE_DEVICE_SECTIONS,
  REMOTE_SECTION_ICONS,
  REMOTE_SETTINGS_SECTIONS,
  isRemoteSettingsSection,
  remoteSettingsRows,
  type RemoteSettingsSection,
} from './remote-settings-rows.js';
import { REMOTE_SETTINGS_SECTIONS, type RemoteSettingsSection } from './remote-settings-rows.js';

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
    return remote === undefined ? (
      offline
    ) : (
      <>
        <HostDetails key={hostId} remote={remote} t={t} />
        {connected && client !== undefined && remote.host.member === undefined ? (
          <RemoteOwnerPassword key={hostId} client={client} t={t} />
        ) : null}
      </>
    );
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

function RemoteOwnerPassword({ client, t }: { client: HostClient; t: BotHarnessTranslate }) {
  const { call } = remoteHostSettings(client);
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    setAvailable(false);
    void loadTeamMode(call, controller.signal)
      .then((view) => {
        if (!controller.signal.aborted) setAvailable(view.viewer.owner && view.ownerPasswordSet);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [call]);
  return (
    <div ref={mount}>
      {available ? (
        <SettingsRow
          title={t('team.ownerPassword.title')}
          control={
            <Button variant="outline" onClick={() => setOpen(true)}>
              {t('team.ownerPassword.change')}
            </Button>
          }
        />
      ) : null}
      {available && open ? (
        <TeamOwnerPasswordDialog
          t={t}
          hasPassword
          thenEnable={false}
          onCancel={() => setOpen(false)}
          onSubmit={async (password, current, signOutOthers) => {
            await setOwnerPassword(call, password, current, signOutOthers);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

export function LocalHostAppearance({
  hostId,
  name,
  title,
  t,
}: {
  hostId: string | undefined;
  name: string;
  title?: string | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  if (hostId === undefined) return <Note>{t('environment.settings.loadingIdentity')}</Note>;
  return (
    <HostLookSettings key={hostId} hostId={hostId} name={name} available title={title} t={t} />
  );
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
  if (section === REMOTE_SETTINGS_SECTIONS.hostMessaging)
    return <RemoteMessagingSettings client={client} t={t} />;
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
