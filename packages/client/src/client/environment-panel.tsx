import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  Button,
  IconEllipsisOutlineRegular,
  IconRefreshOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { ALL_HOSTS, THIS_HOST, remoteHosts } from './remote-hosts.js';
import { useRemoteHosts } from './host-tabs.js';
import { useThisHost } from './this-host.js';
import { useHostLook, useHostName } from './host-looks.js';
import { HostGlyph } from './host-glyph.js';
import { HostSettings } from './host-settings.js';
import { ConnectionsDialog } from './connections-dialog.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Select } from './ds/select.js';
import { IconButton } from './ds/icon-button.js';
import { PointerMenu, type MenuPoint } from './ds/pointer-menu.js';
import { Menu } from './appearance-primitives.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import { useClientStore } from './use-client-store.js';
import type { BotHarnessTranslate } from './locale.js';
import type { DockPanel } from './dock-panels.js';
import { environmentUnread } from './environment-activity.js';
import { WORKSPACE_CHANNELS } from './workspace-context.js';
import { memberPage } from './member-page.js';

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
    <div role="status" {...stylex.props(styles.status)}>
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
  list: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 0 },
  row: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
  },
  choose: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minHeight: size.row,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    cursor: 'pointer',
    paddingBlock: space.x2,
    paddingInline: space.x3,
    textAlign: 'start',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  selected: { backgroundColor: color.hover },
  body: { minWidth: 0, flex: 1 },
  name: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: text.strong,
  },
  note: {
    display: 'block',
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  count: { flexShrink: 0, color: color.subtle, fontSize: text.metaSize },
  more: {
    marginInlineEnd: space.x2,
    opacity: {
      default: 0,
      [stylex.when.ancestor(':hover')]: 1,
      [stylex.when.ancestor(':focus-within')]: 1,
      '@media (hover: none)': 1,
    },
  },
  moreOpen: { opacity: 1 },
  pickerLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
    maxWidth: '100%',
    lineHeight: text.bodyLine,
  },
  pickerName: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  footer: { flexShrink: 0, padding: 0 },
  status: { paddingBlock: space.x2, paddingInline: space.x3 },
});

function EnvironmentRow({
  id,
  hostId,
  name,
  unread,
  status,
  selected,
  onManage,
  reconnect = false,
  t,
}: {
  id: string;
  hostId: string;
  name: string;
  unread: number | undefined;
  status?: string | undefined;
  selected: boolean;
  onManage: () => void;
  reconnect?: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const look = useHostLook(hostId);
  const label = useHostName(hostId, name);
  const choose = useRef<HTMLButtonElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ kind: 'anchor' } | { kind: 'pointer'; point: MenuPoint }>();
  const items = [
    {
      id: 'settings',
      label: t('environment.settings'),
      icon: <ChannelSidebarIcon name="settings" />,
    },
    ...(reconnect
      ? [
          {
            id: 'reconnect',
            label: t('environment.reconnect'),
            icon: <IconRefreshOutlineRegular size={16} />,
          },
        ]
      : []),
  ];
  const closeMenu = (): void => {
    setMenu(undefined);
  };
  const selectMenu = (action: string): void => {
    setMenu(undefined);
    if (action === 'settings') onManage();
    if (action === 'reconnect') remoteHosts().client(id)?.retryNow('manual_retry');
  };
  return (
    <div
      {...stylex.props(
        stylex.defaultMarker(),
        styles.row,
        (selected || menu !== undefined) && styles.selected,
      )}
      data-environment={id}
    >
      <button
        ref={choose}
        type="button"
        aria-pressed={selected}
        {...stylex.props(styles.choose)}
        onClick={() => remoteHosts().select(id)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ kind: 'pointer', point: { x: event.clientX, y: event.clientY } });
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ kind: 'pointer', point: { x: rect.left, y: rect.bottom } });
        }}
      >
        <HostGlyph look={look} />
        <span {...stylex.props(styles.body)}>
          <span {...stylex.props(styles.name)}>{label}</span>
          {status ? <span {...stylex.props(styles.note)}>{status}</span> : null}
        </span>
        <span
          {...stylex.props(styles.count)}
          aria-label={
            unread === undefined
              ? t('environment.unavailable')
              : t('roster.unreadCount', { count: String(unread) })
          }
        >
          {unread === undefined ? '…' : unread}
        </span>
      </button>
      <Menu
        open={menu?.kind === 'anchor'}
        portal
        dense
        align="end"
        autoFocus
        returnFocus={() => more.current}
        anchor={
          <IconButton
            ref={more}
            size="inline"
            tone="subtle"
            xstyle={[styles.more, menu !== undefined && styles.moreOpen]}
            aria-label={t('environment.moreNamed', { name: label })}
            aria-haspopup="menu"
            aria-expanded={menu !== undefined}
            onClick={() => setMenu(menu === undefined ? { kind: 'anchor' } : undefined)}
          >
            <IconEllipsisOutlineRegular size={16} />
          </IconButton>
        }
        items={items}
        onSelect={selectMenu}
        onClose={closeMenu}
      />
      {menu?.kind === 'pointer' ? (
        <PointerMenu
          point={menu.point}
          anchor={<span aria-hidden="true" />}
          autoFocus
          returnFocus={() => choose.current}
          items={items}
          onSelect={selectMenu}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  );
}

export function EnvironmentFilter({ t }: { t: BotHarnessTranslate }): ReactElement | null {
  return memberPage() ? null : <OwnerEnvironmentFilter t={t} />;
}

function OwnerEnvironmentFilter({ t }: { t: BotHarnessTranslate }): ReactElement {
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
  const look = useHostLook(hostId);
  return (
    <span {...stylex.props(styles.pickerLabel)}>
      <HostGlyph look={look} />
      <span {...stylex.props(styles.pickerName)}>{label}</span>
    </span>
  );
}

export function EnvironmentPanel({ t }: { t: BotHarnessTranslate }): ReactElement | null {
  return memberPage() ? null : <OwnerEnvironmentPanel t={t} />;
}

function OwnerEnvironmentPanel({ t }: { t: BotHarnessTranslate }): ReactElement {
  const snapshot = useRemoteHosts();
  const local = useThisHost();
  const localUnread = useClientStore((state) =>
    state.activityList.attentionStatus === 'ready'
      ? Object.values(state.activityList.channelUnread).reduce((sum, count) => sum + count, 0)
      : undefined,
  );
  const localStatus = useClientStore((state) => state.activityList.attentionStatus);
  const [settings, setSettings] = useState<{ hostId: string; name: string; local: boolean }>();
  const [adding, setAdding] = useState(false);
  return (
    <div {...stylex.props(styles.root)} data-environment-panel="">
      <div {...stylex.props(styles.list)}>
        <div {...stylex.props(styles.row, snapshot.tab === ALL_HOSTS && styles.selected)}>
          <button
            type="button"
            {...stylex.props(styles.choose)}
            aria-pressed={snapshot.tab === ALL_HOSTS}
            onClick={() => remoteHosts().select(ALL_HOSTS)}
          >
            <ChannelSidebarIcon name="globe" />
            <span {...stylex.props(styles.name)}>{t('remoteHosts.all')}</span>
          </button>
        </div>
        <EnvironmentRow
          id={THIS_HOST}
          hostId={local.id ?? THIS_HOST}
          name={local.name ?? t('remoteHosts.this')}
          unread={localUnread}
          status={
            localStatus === 'ready'
              ? undefined
              : t(localStatus === 'error' ? 'environment.unavailable' : 'environment.loading')
          }
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
              remote.snapshot.connection.status === 'connected'
                ? environmentUnread(remote.inbox)
                : undefined
            }
            reconnect={remote.snapshot.connection.status !== 'connected'}
            selected={snapshot.tab === remote.host.hostId}
            status={
              remote.snapshot.connection.status === 'connected'
                ? remote.inbox.status === 'ready'
                  ? environmentUnread(remote.inbox) === undefined
                    ? t('environment.partial')
                    : undefined
                  : t(
                      remote.inbox.status === 'error'
                        ? 'environment.unavailable'
                        : 'environment.loading',
                    )
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
        <div {...stylex.props(styles.row)}>
          <button type="button" {...stylex.props(styles.choose)} onClick={() => setAdding(true)}>
            <ChannelSidebarIcon name="plus" />
            {t('remoteHosts.add')}
          </button>
        </div>
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
    icon: 'server',
    scope: 'global',
    order: -110,
    defaultPosition: { zone: 'left', relativeTo: WORKSPACE_CHANNELS },
    component: () => <EnvironmentPanel t={t} />,
  };
}
