import { useRef, type ReactElement } from 'react';

import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { useHostLook } from './host-looks.js';
import type { BotHarnessTranslate } from './locale.js';
import { RemoteHostModels } from './remote-host-models.js';
import type { RemoteHosts } from './remote-hosts.js';
import { TargetName } from './target-name.js';

export type SettingsEnvironments = Pick<RemoteHosts, 'getSnapshot' | 'subscribe' | 'client'>;

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

export function RemoteEnvironmentModels({
  environments,
  hostId,
  name,
  t,
}: {
  environments: SettingsEnvironments;
  hostId: string;
  name: string;
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
