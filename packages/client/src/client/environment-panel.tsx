import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { ALL_HOSTS, THIS_HOST, remoteHosts } from './remote-hosts.js';
import { useRemoteHosts } from './host-tabs.js';
import { useThisHost } from './this-host.js';
import { useHostLook, useHostName } from './host-looks.js';
import { HostGlyph } from './host-glyph.js';
import { HostSettings } from './host-settings.js';
import { ConnectionsDialog } from './connections-dialog.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Select } from './ds/select.js';
import { color, space, text } from './ds/tokens.stylex.js';
import { useClientStore } from './use-client-store.js';
import type { BotHarnessTranslate } from './locale.js';
import type { DockPanel } from './dock-panels.js';

export const ENVIRONMENT_PANEL = 'environments';

export function EnvironmentOffline({
  hostId,
  t,
}: {
  hostId: string;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const snapshot = useRemoteHosts();
  const remote = snapshot.hosts.find(({ host }) => host.hostId === hostId);
  if (!remote || remote.snapshot.connection.status === 'connected') return null;
  return (
    <div role="status" {...stylex.props(styles.footer)}>
      {t('environment.offline')}{' '}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => remoteHosts().client(hostId)?.retryNow('manual_retry')}
      >
        {t('environment.reconnect')}
      </Button>
    </div>
  );
}
const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  list: { flex: 1, overflowY: 'auto', padding: space.x3 },
  row: { display: 'flex', alignItems: 'center', gap: space.x2, paddingBlock: space.x2 },
  choose: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    borderWidth: 0,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    cursor: 'pointer',
    padding: space.x2,
    textAlign: 'start',
  },
  selected: { backgroundColor: color.selected },
  body: { minWidth: 0, flex: 1, overflowWrap: 'anywhere' },
  note: { display: 'block', color: color.subtle, fontSize: text.metaSize },
  footer: { flexShrink: 0, padding: space.x3 },
});

function EnvironmentRow({
  id,
  hostId,
  name,
  unread,
  status,
  selected,
  onManage,
  t,
}: {
  id: string;
  hostId: string;
  name: string;
  unread: number | undefined;
  status?: string | undefined;
  selected: boolean;
  onManage: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const look = useHostLook(hostId);
  const label = useHostName(hostId, name);
  return (
    <div {...stylex.props(styles.row)} data-environment={id}>
      <button
        type="button"
        aria-pressed={selected}
        {...stylex.props(styles.choose, selected && styles.selected)}
        onClick={() => remoteHosts().select(id)}
      >
        <HostGlyph look={look} />
        <span {...stylex.props(styles.body)}>
          {label}
          {status ? <span {...stylex.props(styles.note)}>{status}</span> : null}
        </span>
        <span aria-label={t('environment.unread')}>{unread === undefined ? '…' : unread}</span>
      </button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('environment.manageNamed', { name: label })}
        onClick={onManage}
      >
        <ChannelSidebarIcon name="settings" />
      </Button>
      {status ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => remoteHosts().client(id)?.retryNow('manual_retry')}
        >
          {t('environment.reconnect')}
        </Button>
      ) : null}
    </div>
  );
}

export function EnvironmentFilter({ t }: { t: BotHarnessTranslate }): ReactElement {
  const snapshot = useRemoteHosts();
  const local = useThisHost();
  const sources = remoteHosts();
  return (
    <Select
      label={t('environment.scope')}
      value={snapshot.tab}
      options={[
        { value: ALL_HOSTS, label: t('remoteHosts.all') },
        {
          value: THIS_HOST,
          label: (
            <EnvironmentName
              hostId={local.id ?? THIS_HOST}
              name={local.name ?? t('remoteHosts.this')}
            />
          ),
        },
        ...snapshot.hosts.map(({ host }) => ({
          value: host.hostId,
          label: <EnvironmentName hostId={host.hostId} name={host.hostName} />,
        })),
      ]}
      onChange={(scope) => sources.select(scope)}
    />
  );
}

function EnvironmentName({ hostId, name }: { hostId: string; name: string }): ReactElement {
  const label = useHostName(hostId, name);
  return <>{label}</>;
}

export function EnvironmentPanel({ t }: { t: BotHarnessTranslate }): ReactElement {
  const snapshot = useRemoteHosts();
  const local = useThisHost();
  const localUnread = useClientStore((state) =>
    Object.values(state.activityList.channelUnread).reduce((sum, count) => sum + count, 0),
  );
  const [settings, setSettings] = useState<{ hostId: string; name: string; local: boolean }>();
  const [adding, setAdding] = useState(false);
  return (
    <div {...stylex.props(styles.root)} data-environment-panel="">
      <div {...stylex.props(styles.list)}>
        <button
          type="button"
          {...stylex.props(styles.choose, snapshot.tab === ALL_HOSTS && styles.selected)}
          aria-pressed={snapshot.tab === ALL_HOSTS}
          onClick={() => remoteHosts().select(ALL_HOSTS)}
        >
          <ChannelSidebarIcon name="globe" />
          {t('remoteHosts.all')}
        </button>
        <EnvironmentRow
          id={THIS_HOST}
          hostId={local.id ?? THIS_HOST}
          name={local.name ?? t('remoteHosts.this')}
          unread={localUnread}
          selected={snapshot.tab === THIS_HOST}
          onManage={() =>
            setSettings({
              hostId: local.id ?? THIS_HOST,
              name: local.name ?? t('remoteHosts.this'),
              local: true,
            })
          }
          t={t}
        />
        {snapshot.hosts.map((remote) => (
          <EnvironmentRow
            key={remote.host.hostId}
            id={remote.host.hostId}
            hostId={remote.host.hostId}
            name={remote.host.hostName}
            unread={
              remote.inbox.status === 'ready'
                ? Object.values(remote.inbox.unread ?? {}).reduce((sum, count) => sum + count, 0)
                : undefined
            }
            selected={snapshot.tab === remote.host.hostId}
            status={
              remote.snapshot.connection.status === 'connected'
                ? remote.inbox.status === 'ready'
                  ? undefined
                  : t('environment.loading')
                : t('environment.offline')
            }
            onManage={() =>
              setSettings({ hostId: remote.host.hostId, name: remote.host.hostName, local: false })
            }
            t={t}
          />
        ))}
      </div>
      <div {...stylex.props(styles.footer)}>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          {t('remoteHosts.add')}
        </Button>
      </div>
      {adding ? <ConnectionsDialog joinComputer t={t} onClose={() => setAdding(false)} /> : null}
      {settings &&
      (settings.local || snapshot.hosts.some(({ host }) => host.hostId === settings.hostId)) ? (
        <HostSettings
          key={settings.hostId}
          {...settings}
          t={t}
          onClose={() => setSettings(undefined)}
        />
      ) : null}
    </div>
  );
}

export function createEnvironmentPanel(t: BotHarnessTranslate): DockPanel {
  return {
    id: ENVIRONMENT_PANEL,
    title: t('environment.title'),
    icon: 'globe',
    scope: 'global',
    order: -110,
    defaultPosition: { zone: 'left' },
    component: () => <EnvironmentPanel t={t} />,
  };
}
