import { useMemo, useState, useSyncExternalStore } from 'react';
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

export function RemoteHostSettings({
  hostId,
  name,
  onClose,
  t,
}: {
  hostId: string;
  name: string;
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
  const [section, setSection] = useState('models');
  const sections = [
    { id: 'models', label: t('remoteHosts.settings.models') },
    { id: 'usage', label: t('overviewUsage.title') },
    { id: 'storage', label: t('storage.title') },
  ];
  return (
    <SettingsDialog
      title={sections.find((entry) => entry.id === section)!.label}
      navTitle={t('remoteHosts.settings')}
      caption={name}
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
      {client === undefined || remote?.snapshot.connection.status !== 'connected' ? (
        <Note tone="danger">
          {t(
            remote?.snapshot.connection.status === 'refused'
              ? 'remoteHosts.refused'
              : 'remoteHosts.offline',
            { name },
          )}
        </Note>
      ) : (
        <SettingsContent key={hostId} client={client} name={name} section={section} t={t} />
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
