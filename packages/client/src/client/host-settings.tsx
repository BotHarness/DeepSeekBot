import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useMountedResource } from './mounted-resource.js';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { hostSettingsDrafts, type HostDraftChoice } from './host-settings-drafts.js';
import { FormDialog } from './ds/form-dialog.js';
import * as stylex from '@stylexjs/stylex';
import { HostGlyph } from './host-glyph.js';
import { HostLookSettings } from './host-look-settings.js';
import { useHostLook } from './host-looks.js';
import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';
import { RemoteNotificationSettings } from './remote-notification-settings.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { space } from './ds/tokens.stylex.js';
import { SettingsDialog } from './ds/settings-dialog.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { PillButton } from './ds/pill-button.js';
import type { BotHarnessTranslate } from './locale.js';
import { OverviewUsageView } from './overview-usage-view.js';
import { OverviewMemoryView } from './overview-memory-view.js';
import { RemoteHostModels } from './remote-host-models.js';
import { HostDetails } from './connection-hosts.js';
import { remoteHosts, THIS_HOST } from './remote-hosts.js';
import {
  settingsTargetIdentity,
  type EnvironmentSettingsTarget,
} from './environment-settings-target.js';
import { remoteHostSettingsSource } from './remote-host-settings-source.js';
import { StorageSettings } from './storage-settings.js';
import { useThisHost } from './this-host.js';
import { localEnvironmentSettings } from './environment-settings-source.js';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';

const styles = stylex.create({
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    paddingInline: space.x3,
    minWidth: 0,
  },
});

export function HostSettings({
  hostId,
  name,
  local = false,
  onClose,
  t,
}: {
  hostId: string;
  name: string;
  local?: boolean;
  onClose: () => void;
  t: BotHarnessTranslate;
}) {
  const [target, setTarget] = useState(() => ({ hostId, name, local }));
  return <EnvironmentSettings target={target} onTarget={setTarget} onClose={onClose} t={t} />;
}

function EnvironmentSettings({
  target,
  onTarget,
  onClose,
  t,
}: {
  target: EnvironmentSettingsTarget;
  onTarget: (target: EnvironmentSettingsTarget) => void;
  onClose: () => void;
  t: BotHarnessTranslate;
}) {
  const thisHost = useThisHost();
  const { hostId, name, local } = settingsTargetIdentity(target, thisHost);
  const localSource = localEnvironmentSettings();
  const sources = remoteHosts();
  const snapshot = useSyncExternalStore(
    sources.subscribe,
    sources.getSnapshot,
    sources.getSnapshot,
  );
  const remote = snapshot.hosts.find((entry) => entry.host.hostId === hostId);
  const client = sources.client(hostId);
  const retainedClient = useRef({ hostId, client });
  if (retainedClient.current.hostId !== hostId || client !== undefined)
    retainedClient.current = { hostId, client };
  const targetClient = client ?? retainedClient.current.client;
  const connected = remote?.snapshot.connection.status === 'connected' && client !== undefined;
  const look = useHostLook(hostId);
  const displayName = shownHostName(look, name);
  const [section, setSection] = useState('models');
  const leaving = useRef(false);
  const leaveReason = useRef<'switch' | 'leave'>('leave');
  const leave = async (next: () => void, reason: 'switch' | 'leave' = 'leave') => {
    if (leaving.current) return;
    leaving.current = true;
    leaveReason.current = reason;
    try {
      if (await hostSettingsDrafts.prepare(hostId)) next();
    } finally {
      leaving.current = false;
      leaveReason.current = 'leave';
    }
  };
  const [draftPrompt, setDraftPrompt] = useState(false);
  const choice = useRef<(value: HostDraftChoice) => void>();
  const settle = (value: HostDraftChoice) => {
    const resolve = choice.current;
    choice.current = undefined;
    setDraftPrompt(false);
    resolve?.(value);
  };
  const mount = useMountedResource<HTMLSpanElement>(() => {
    const release = hostSettingsDrafts.prompt(
      hostId,
      () =>
        new Promise((resolve) => {
          choice.current = resolve;
          setDraftPrompt(true);
        }),
    );
    return () => {
      release();
      choice.current?.('cancel');
      choice.current = undefined;
    };
  }, [hostId]);
  const sections = [
    {
      id: 'models',
      label: t('remoteHosts.settings.models'),
      icon: <ChannelSidebarIcon name="cpu" />,
    },
    {
      id: 'appearance',
      label: t('environment.settings.appearance'),
      icon: <ChannelSidebarIcon name="paintbrush" />,
    },
    ...(local
      ? []
      : [
          {
            id: 'notifications',
            label: t('remoteHosts.notifications'),
            icon: <ChannelSidebarIcon name="bell" />,
          },
          {
            id: 'usage',
            label: t('overviewUsage.title'),
            icon: <ChannelSidebarIcon name="gauge" />,
          },
          { id: 'storage', label: t('storage.title'), icon: <ChannelSidebarIcon name="files" /> },
          {
            id: 'connections',
            label: t('connections.remote.title'),
            icon: <ChannelSidebarIcon name="plug" />,
          },
        ]),
  ];
  return (
    <SettingsDialog
      title={t('remoteHosts.settings.title', { name: displayName })}
      caption={
        <div {...stylex.props(styles.identity)}>
          <Select
            label={t('environment.settings.target')}
            value={hostId}
            options={[
              {
                value: thisHost.id ?? THIS_HOST,
                label: (
                  <TargetName
                    hostId={thisHost.id ?? THIS_HOST}
                    name={thisHost.name ?? t('remoteHosts.this')}
                  />
                ),
              },
              ...snapshot.hosts.map(({ host }) => ({
                value: host.hostId,
                label: <TargetName hostId={host.hostId} name={host.hostName} />,
              })),
              ...(!local && remote === undefined
                ? [{ value: hostId, label: <TargetName hostId={hostId} name={name} /> }]
                : []),
            ]}
            onChange={(id) => {
              if (id === hostId) return;
              if (id === (thisHost.id ?? THIS_HOST)) {
                void leave(() => {
                  onTarget({
                    hostId: id,
                    name: thisHost.name ?? t('remoteHosts.this'),
                    local: true,
                  });
                  if (section !== 'models' && section !== 'appearance') setSection('models');
                }, 'switch');
                return;
              }
              const next = snapshot.hosts.find(({ host }) => host.hostId === id);
              if (next)
                void leave(
                  () => onTarget({ hostId: id, name: next.host.hostName, local: false }),
                  'switch',
                );
            }}
          />
        </div>
      }
      headerAction={
        localSource === undefined ? undefined : (
          <PillButton
            onClick={() => {
              void leave(() => {
                onClose();
                localSource.openPreferences();
              });
            }}
          >
            {t('environment.settings.app')}
          </PillButton>
        )
      }
      sections={sections}
      activeId={section}
      onSelect={(id) => {
        if (id !== section) void leave(() => setSection(id));
      }}
      onClose={() => {
        void leave(onClose);
      }}
      labels={{
        nav: t('remoteHosts.settings'),
        close: t('common.close'),
        picker: (label) => label,
      }}
    >
      <span ref={mount} hidden />
      {draftPrompt ? (
        <FormDialog
          title={t('relationships.unsaved')}
          description={t('relationships.unsavedHint')}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          submitLabel={t(
            leaveReason.current === 'switch'
              ? 'environment.settings.saveAndSwitch'
              : 'relationships.save',
          )}
          onCancel={() => settle('cancel')}
          onSubmit={() => settle('save')}
          secondary={
            <Button variant="outline" onClick={() => settle('discard')}>
              {t('relationships.discard')}
            </Button>
          }
        />
      ) : null}
      {section === 'connections' && remote ? (
        <HostDetails key={hostId} remote={remote} t={t} />
      ) : section === 'appearance' ? (
        <HostLookSettings key={hostId} hostId={hostId} name={name} t={t} />
      ) : section === 'notifications' ? (
        <RemoteNotificationSettings
          key={hostId}
          hostId={hostId}
          notifications={sources.notifications}
          t={t}
        />
      ) : section === 'models' && local && localSource !== undefined ? (
        <RemoteHostModels key={hostId} hostId={hostId} client={localSource.models} t={t} />
      ) : section === 'models' && !local && targetClient !== undefined ? (
        <>
          {connected ? null : (
            <Note tone="danger">
              {t(
                remote === undefined ? 'environment.settings.disconnected' : 'remoteHosts.offline',
                { name: displayName },
              )}
            </Note>
          )}
          <SettingsContent
            key={hostId}
            hostId={hostId}
            client={targetClient}
            name={displayName}
            section={section}
            available={connected}
            t={t}
          />
        </>
      ) : client === undefined || remote?.snapshot.connection.status !== 'connected' ? (
        <Note tone="danger">
          {t(
            local
              ? 'environment.settings.unsupported'
              : remote === undefined
                ? 'environment.settings.disconnected'
                : remote?.snapshot.connection.status === 'refused'
                  ? 'remoteHosts.refused'
                  : 'remoteHosts.offline',
            { name: displayName },
          )}
        </Note>
      ) : (
        <SettingsContent
          key={hostId}
          hostId={hostId}
          client={client}
          name={displayName}
          section={section}
          t={t}
        />
      )}
    </SettingsDialog>
  );
}

function TargetName({ hostId, name }: { hostId: string; name: string }) {
  const look = useHostLook(hostId);
  return (
    <>
      <HostGlyph look={look} /> {shownHostName(look, name)}
    </>
  );
}

function SettingsContent({
  hostId,
  client,
  name,
  section,
  available = true,
  t,
}: {
  hostId: string;
  client: HostClient;
  name: string;
  section: string;
  available?: boolean;
  t: BotHarnessTranslate;
}) {
  const source = useMemo(() => remoteHostSettingsSource(client), [client]);
  if (section === 'models')
    return <RemoteHostModels hostId={hostId} client={client} available={available} t={t} />;
  if (section === 'storage')
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
