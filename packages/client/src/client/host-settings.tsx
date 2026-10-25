import { useMemo, useState, useSyncExternalStore } from 'react';
import * as stylex from '@stylexjs/stylex';
import { HostGlyph } from './host-glyph.js';
import { HostLookSettings } from './host-look-settings.js';
import { useHostLook } from './host-looks.js';
import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';
import { RemoteNotificationSettings } from './remote-notification-settings.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { color, space, text } from './ds/tokens.stylex.js';
import { SettingsDialog } from './ds/settings-dialog.js';
import { Note } from './ds/note.js';
import type { BotHarnessTranslate } from './locale.js';
import { OverviewUsageView } from './overview-usage-view.js';
import { OverviewMemoryView } from './overview-memory-view.js';
import { RemoteHostModels } from './remote-host-models.js';
import { remoteHosts } from './remote-hosts.js';
import { remoteHostSettingsSource } from './remote-host-settings-source.js';
import { StorageSettings } from './storage-settings.js';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';

const styles = stylex.create({
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    paddingInline: space.x3,
    minWidth: 0,
  },
  label: { display: 'flex', flexDirection: 'column', gap: space.x1, minWidth: 0 },
  name: {
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  kind: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
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
  const sources = remoteHosts();
  const snapshot = useSyncExternalStore(
    sources.subscribe,
    sources.getSnapshot,
    sources.getSnapshot,
  );
  const remote = snapshot.hosts.find((entry) => entry.host.hostId === hostId);
  const client = sources.client(hostId);
  const look = useHostLook(hostId);
  const displayName = shownHostName(look, name);
  const [section, setSection] = useState('appearance');
  const sections = [
    {
      id: 'appearance',
      label: t('remoteHosts.look.appearance'),
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
            id: 'models',
            label: t('remoteHosts.settings.models'),
            icon: <ChannelSidebarIcon name="cpu" />,
          },
          {
            id: 'usage',
            label: t('overviewUsage.title'),
            icon: <ChannelSidebarIcon name="gauge" />,
          },
          { id: 'storage', label: t('storage.title'), icon: <ChannelSidebarIcon name="files" /> },
        ]),
  ];
  if (!local && remote === undefined) return null;
  return (
    <SettingsDialog
      title={t('remoteHosts.settings.title', { name: displayName })}
      caption={
        <div {...stylex.props(styles.identity)}>
          <HostGlyph look={look} size={28} />
          <span {...stylex.props(styles.label)}>
            <span title={displayName} {...stylex.props(styles.name)}>
              {displayName}
            </span>
            <span {...stylex.props(styles.kind)}>{t('remoteHosts.settings')}</span>
          </span>
        </div>
      }
      sections={sections}
      activeId={section}
      onSelect={setSection}
      onClose={onClose}
      labels={{
        nav: t('remoteHosts.settings'),
        close: t('common.close'),
        picker: (label) => label,
      }}
    >
      {section === 'appearance' ? (
        <HostLookSettings hostId={hostId} name={name} t={t} />
      ) : section === 'notifications' ? (
        <RemoteNotificationSettings hostId={hostId} notifications={sources.notifications} t={t} />
      ) : client === undefined || remote?.snapshot.connection.status !== 'connected' ? (
        <Note tone="danger">
          {t(
            remote?.snapshot.connection.status === 'refused'
              ? 'remoteHosts.refused'
              : 'remoteHosts.offline',
            { name: displayName },
          )}
        </Note>
      ) : (
        <SettingsContent key={hostId} client={client} name={displayName} section={section} t={t} />
      )}
    </SettingsDialog>
  );
}

function SettingsContent({
  client,
  name,
  section,
  t,
}: {
  client: HostClient;
  name: string;
  section: string;
  t: BotHarnessTranslate;
}) {
  const source = useMemo(() => remoteHostSettingsSource(client), [client]);
  if (section === 'models') return <RemoteHostModels client={client} t={t} />;
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
