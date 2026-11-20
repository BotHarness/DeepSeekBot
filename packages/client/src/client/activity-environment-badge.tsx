import type { ReactElement } from 'react';
import { EnvironmentName } from './environment-panel.js';
import { useHostName } from './host-looks.js';
import { useThisHost } from './this-host.js';
import { THIS_HOST } from './remote-hosts.js';
import type { RemoteHost } from './remote-hosts.js';
import type { BotHarnessTranslate } from './locale.js';

export function ActivityEnvironmentBadge({
  hostId,
  name,
  t,
}: {
  hostId?: string;
  name?: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const local = useThisHost();
  return (
    <span className="bh-activity-environment" data-activity-host={hostId ?? local.id ?? THIS_HOST}>
      <EnvironmentName
        hostId={hostId ?? local.id ?? THIS_HOST}
        name={name ?? local.name ?? t('remoteHosts.this')}
      />
    </span>
  );
}

export function ActivityEnvironmentStatus({
  host,
  t,
}: {
  host: RemoteHost;
  t: BotHarnessTranslate;
}) {
  const name = useHostName(host.host.hostId, host.host.hostName);
  if (host.snapshot.connection.status === 'connected') return null;
  return (
    <p role="status" className="bh-note">
      {t(
        host.snapshot.connection.status === 'refused'
          ? 'remoteHosts.refused'
          : 'remoteHosts.offline',
        { name },
      )}
    </p>
  );
}
