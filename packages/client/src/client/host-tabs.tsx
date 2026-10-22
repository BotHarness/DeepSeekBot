import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { RemoteHost, RemoteConversationTarget } from './remote-hosts.js';
import { ALL_HOSTS, remoteHosts, THIS_HOST } from './remote-hosts.js';
import { UnreadCount } from './unread-count.js';
import { HostSettings } from './host-settings.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { RemoteAvatar } from './remote-avatar.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { PointerMenu, type MenuPoint } from './ds/pointer-menu.js';
import { TextField } from './ds/field.js';
import { Tooltip } from './ds/tooltip.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useThisHost } from './this-host.js';
export { useThisHost } from './this-host.js';
import { HostGlyph } from './host-glyph.js';
export { HostGlyph } from './host-glyph.js';
import { DEFAULT_HOST_LOOK, shownHostName, type HostLook } from '../../../../apps/mobile/src/ui/design/host-look.js';
import { hostLooks, unusedHostLook, useHostLook, useHostName } from './host-looks.js';

const focusRing = { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` };

const styles = stylex.create({
  strip: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x1,
    minWidth: 0,
    overflowX: 'auto',
    scrollbarWidth: 'none',
    paddingBlock: space.x2,
    paddingInline: space.x3,
  },
  tab: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size.icon,
    height: size.icon,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: { default: color.subtle, ':hover': color.fg },
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: focusRing,
    outlineOffset: '-2px',
  },
  selected: {
    backgroundColor: { default: color.selected, ':hover': color.selected },
    color: { default: color.fg, ':hover': color.fg },
  },
  offline: { filter: 'grayscale(1)', opacity: 0.5 },
  badge: {
    position: 'absolute',
    top: 0,
    insetInlineEnd: 0,
    minWidth: text.metaLine,
    height: text.metaLine,
    paddingInline: space.x1,
    boxSizing: 'border-box',
    borderRadius: radius.round,
    backgroundColor: color.accent,
    color: color.onAccent,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
    textAlign: 'center',
  },
  status: {
    margin: 0,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },

});

export function useRemoteHosts() {
  const sources = remoteHosts();
  return useSyncExternalStore(sources.subscribe, sources.getSnapshot, sources.getSnapshot);
}

export function HostMark({ hostId }: { hostId?: string | undefined }): ReactElement {
  const thisHost = useThisHost();
  const look = useHostLook(hostId ?? thisHost.id);
  return (
    <span className="bh-muted-mark" data-remote-host-mark={hostId ?? 'local'}>
      <HostGlyph look={look} size={12} />
    </span>
  );
}

function online(remote: RemoteHost): boolean {
  return remote.snapshot.connection.status === 'connected';
}

function unreadCount(remote: RemoteHost): number {
  if (remote.inbox.status !== 'ready') return 0;
  return Object.values(remote.inbox.unread ?? {}).reduce((sum, count) => sum + count, 0);
}

function HostTab({
  id,
  label,
  look,
  selected,
  offline,
  unread,
  onMenu,
}: {
  id: string;
  label: string;
  look: HostLook | undefined;
  selected: boolean;
  offline: boolean;
  unread: number;
  onMenu?: ((point: MenuPoint) => void) | undefined;
}): ReactElement {
  return (
    <Tooltip label={label} side="bottom" delayMs={300}>
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        aria-label={label}
        data-host-tab={id}
        {...stylex.props(styles.tab, selected && styles.selected, offline && styles.offline)}
        onClick={() => remoteHosts().select(id)}
        onContextMenu={(event) => {
          if (onMenu === undefined) return;
          event.preventDefault();
          onMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        {look === undefined ? (
          <ChannelSidebarIcon name="messages-square" />
        ) : (
          <HostGlyph look={look} />
        )}
        {unread > 0 ? (
          <span aria-hidden="true" {...stylex.props(styles.badge)}>
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}


function RemoteHostTab({ remote, selected, onMenu, t }: {
  remote: RemoteHost; selected: boolean; onMenu: (point: MenuPoint) => void; t: BotHarnessTranslate;
}) {
  const look = useHostLook(remote.host.hostId);
  const name = shownHostName(look, remote.host.hostName);
  const unread = unreadCount(remote);
  return <HostTab id={remote.host.hostId} label={!online(remote) ? t('remoteHosts.offline', { name }) : unread > 0 ? t('remoteHosts.unreadNamed', { name, count: unread }) : name}
    look={look} selected={selected} offline={!online(remote)} unread={unread} onMenu={onMenu} />;
}

export function HostTabs({ t }: { t: BotHarnessTranslate }): ReactElement | null {
  const sources = remoteHosts();
  const snapshot = useRemoteHosts();
  const thisHost = useThisHost();
  const localLook = useHostLook(thisHost.id ?? THIS_HOST);
  const [menu, setMenu] = useState<{ hostId: string; point: MenuPoint } | undefined>(undefined);
  const [removing, setRemoving] = useState<RemoteHost | undefined>(undefined);
  const [settings, setSettings] = useState<{ hostId: string; name: string; local: boolean }>();
  const proxy = useRef<HTMLSpanElement | null>(null);

  const thisId = thisHost.id ?? THIS_HOST;
  const thisName = shownHostName(localLook, thisHost.name ?? t('remoteHosts.this'));
  const selectedRemote = snapshot.hosts.find((remote) => remote.host.hostId === snapshot.tab);
  const menuRemote = snapshot.hosts.find((remote) => remote.host.hostId === menu?.hostId);
  const selectedName = useHostName(selectedRemote?.host.hostId, selectedRemote?.host.hostName ?? '');
  const removingName = useHostName(removing?.host.hostId, removing?.host.hostName ?? '');
  if (snapshot.hosts.length === 0) return null;
  return (
    <>
      <div
        role="tablist"
        aria-label={t('remoteHosts.tabs')}
        {...stylex.props(styles.strip)}
        data-host-tabs=""
      >
        <HostTab
          id={ALL_HOSTS}
          label={t('remoteHosts.all')}
          look={undefined}
          selected={snapshot.tab === ALL_HOSTS}
          offline={false}
          unread={0}
        />
        <HostTab
          id={THIS_HOST}
          label={t('remoteHosts.thisNamed', { name: thisName })}
          look={localLook}
          selected={snapshot.tab === THIS_HOST}
          offline={false}
          unread={0}
          onMenu={(point) => setMenu({ hostId: thisId, point })}
        />
        {snapshot.hosts.map((remote) => (
          <RemoteHostTab key={remote.host.hostId} remote={remote} selected={snapshot.tab === remote.host.hostId}
            onMenu={(point) => setMenu({ hostId: remote.host.hostId, point })} t={t} />
        ))}
      </div>
      {selectedRemote !== undefined && !online(selectedRemote) ? (
        <p role="status" {...stylex.props(styles.status)}>
          {selectedRemote.snapshot.connection.status === 'refused'
            ? t('remoteHosts.refused', { name: selectedName })
            : t('remoteHosts.offline', { name: selectedName })}
        </p>
      ) : null}
      {menu === undefined ? null : (
        <span hidden>
          <PointerMenu
            point={menu.point}
            dense
            autoFocus
            anchor={<span ref={proxy} aria-hidden="true" />}
            items={[
              { id: 'settings', label: t('remoteHosts.settings') },
              ...(menuRemote === undefined
                ? []
                : [
                    { id: 'remove', label: t('remoteHosts.remove.confirm'), danger: true },
                  ]),
            ]}
            onSelect={(id) => {
              setMenu(undefined);
              if (id === 'settings' && (menuRemote !== undefined || menu.hostId === thisId))
                setSettings({ hostId: menu.hostId, name: menuRemote?.host.hostName ?? thisHost.name ?? thisName, local: menuRemote === undefined });
              if (id === 'remove' && menuRemote !== undefined) setRemoving(menuRemote);
            }}
            onClose={() => setMenu(undefined)}
          />
        </span>
      )}
      {settings === undefined ? null : (
        <HostSettings
          key={settings.hostId}
          hostId={settings.hostId}
          name={settings.name}
          local={settings.local}
          onClose={() => setSettings(undefined)}
          t={t}
        />
      )}
      {removing === undefined ? null : (
        <ConfirmDialog
          title={t('remoteHosts.remove.title', { name: removingName })}
          description={t('remoteHosts.remove.description')}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t('remoteHosts.remove.confirm')}
          onCancel={() => setRemoving(undefined)}
          onConfirm={() => {
            void sources.remove(removing.host.hostId);
            setRemoving(undefined);
          }}
        />
      )}
    </>
  );
}

const PAIR_ERRORS: Partial<Record<string, BotHarnessKey>> = {
  'link-invalid': 'remoteHosts.error.link-invalid',
  'link-expired': 'remoteHosts.error.link-expired',
  'offer-invalid': 'remoteHosts.error.offer-invalid',
  'offer-expired': 'remoteHosts.error.offer-expired',
  'no-route': 'remoteHosts.error.no-route',
  'already-paired': 'remoteHosts.error.already-paired',
  'this-host': 'remoteHosts.error.this-host',
};

export function AddRemoteHostDialog({
  onClose,
  t,
}: {
  onClose: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const thisHost = useThisHost();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState<{
    fingerprint: string;
    resolve(value: boolean): void;
  }>();
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>();
  const pending = useRef<AbortController>();
  const close = () => {
    pending.current?.abort();
    verification?.resolve(false);
    onClose();
  };
  const [error, setError] = useState<string | undefined>(undefined);
  const submit = (): void => {
    if (verification) {
      verification.resolve(true);
      setVerification(undefined);
      setBusy(true);
      return;
    }
    pending.current = new AbortController();
    setBusy(true);
    setError(undefined);
    const name = thisHost.name ?? t('remoteHosts.this');
    void remoteHosts()
      .pair(link, t('remoteHosts.deviceName', { name }), thisHost.id, {
        signal: pending.current.signal,
        confirmFingerprint: (fingerprint) =>
          new Promise((resolve) => {
            setVerification({ fingerprint, resolve });
            setBusy(false);
          }),
        onPending: setDeviceFingerprint,
      })
      .then(async (result) => {
        setBusy(false);
        if (!result.ok) {
          setError(t(PAIR_ERRORS[result.code] ?? 'remoteHosts.error.unreachable'));
          return;
        }
        const looks = hostLooks();
        const used = [
          ...(thisHost.id === undefined ? [] : [looks.look(thisHost.id)]),
          ...remoteHosts()
            .getSnapshot()
            .hosts.filter((remote) => remote.host.hostId !== result.host.hostId)
            .map((remote) => looks.look(remote.host.hostId)),
        ];
        try {
          await looks.update(result.host.hostId, (current) => current === DEFAULT_HOST_LOOK ? unusedHostLook(used) : current);
        } catch {}
        onClose();
      });
  };
  return (
    <FormDialog
      title={t('remoteHosts.add')}
      description={t('remoteHosts.add.description')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t(verification ? 'connect.matches' : 'remoteHosts.add.submit')}
      submitDisabled={link.trim().length === 0}
      busy={busy}
      error={error}
      onCancel={close}
      onSubmit={submit}
      submitData={{ 'data-remote-host-add-submit': '' }}
    >
      {verification ? (
        <div role="status">
          <p>{t('connect.verifyHint')}</p>
          <code>{verification.fingerprint}</code>
        </div>
      ) : null}
      {deviceFingerprint ? (
        <div role="status">
          <p>{t('connect.pending')}</p>
          <code>{deviceFingerprint}</code>
        </div>
      ) : null}
      <TextField
        label={t('remoteHosts.add.link')}
        hint={t('remoteHosts.add.hint')}
        value={link}
        onChange={setLink}
        initialFocus
        monospace
        spellCheck={false}
        autoComplete="off"
        placeholder="deepseekbot://pair?p=…"
      />
    </FormDialog>
  );
}

function rows(remote: RemoteHost): (RemoteConversationTarget & {
  key: string;
  unread: number;
  preview?: string;
  previewAt?: string;
})[] {
  const roster = remote.snapshot.roster;
  if (roster === undefined) return [];
  const hostId = remote.host.hostId;
  const unread = remote.inbox.status === 'ready' ? (remote.inbox.unread ?? {}) : {};
  return [
    ...roster.bots.map((bot) => ({
      key: `bot:${bot.slug}`,
      hostId,
      title: bot.displayName,
      botSlug: bot.slug,
      unread: bot.dmChannelId === undefined ? 0 : (unread[bot.dmChannelId] ?? 0),
      ...(bot.preview === undefined ? {} : { preview: bot.preview }),
      ...(bot.previewAt === undefined ? {} : { previewAt: bot.previewAt }),
    })),
    ...roster.channels.map((channel) => ({
      key: `channel:${channel.id}`,
      hostId,
      title: channel.name,
      channelId: channel.id,
      unread: unread[channel.id] ?? 0,
      ...(channel.preview === undefined ? {} : { preview: channel.preview }),
      ...(channel.previewAt === undefined ? {} : { previewAt: channel.previewAt }),
    })),
  ].sort((a, b) => (b.previewAt ?? '').localeCompare(a.previewAt ?? ''));
}

function sameTarget(
  open: RemoteConversationTarget | undefined,
  row: RemoteConversationTarget,
): boolean {
  return (
    open !== undefined &&
    open.hostId === row.hostId &&
    open.botSlug === row.botSlug &&
    open.channelId === row.channelId
  );
}

export function RemoteHostRows({
  remote,
  query,
  showSource,
  onOpen,
  t,
}: {
  remote: RemoteHost;
  query: string;
  showSource: boolean;
  onOpen?: (() => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const sources = remoteHosts();
  const { open, avatars } = useRemoteHosts();
  const name = useHostName(remote.host.hostId, remote.host.hostName);
  const needle = query.trim().toLocaleLowerCase();
  const visible = rows(remote).filter(
    (row) => needle.length === 0 || row.title.toLocaleLowerCase().includes(needle),
  );
  if (visible.length === 0 && showSource) return null;
  const list = (
    <div className="bh-list-area" data-remote-host={remote.host.hostId}>
      {visible.map((row) => (
        <button
          key={row.key}
          type="button"
          className={`bh-channel-row${row.unread > 0 ? ' bh-has-unread' : ''}${sameTarget(open, row) ? ' bh-selected' : ''}`}
          data-remote-row={row.key}
          aria-label={
            showSource
              ? t('remoteHosts.rowLabel', { name: row.title, host: name })
              : row.title
          }
          onClick={() => {
            onOpen?.();
            sources.open({
              hostId: row.hostId,
              title: row.title,
              ...(row.botSlug === undefined ? {} : { botSlug: row.botSlug }),
              ...(row.channelId === undefined ? {} : { channelId: row.channelId }),
            });
          }}
        >
          <span className="bh-row-avatar">
            <RemoteAvatar
              roster={remote.snapshot.roster}
              avatars={avatars}
              target={row}
              size={34}
              activity={row.botSlug === undefined ? undefined : remote.activity?.get(row.botSlug)}
              t={t}
            />
            <UnreadCount count={row.unread} corner t={t} />
          </span>
          <span className="bh-body">
            <span className="bh-top">
              <span className="bh-name">{row.title}</span>
              {showSource ? <HostMark hostId={remote.host.hostId} /> : null}
            </span>
            <span className="bh-bottom">
              <span className="bh-msg">{row.preview ?? t('rail.noMessages')}</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
  if (!showSource) return list;
  return (
    <div className="bh-section" data-remote-section={remote.host.hostId}>
      <div className="bh-section-head">
        <span className="bh-section-name">{name}</span>
        <span className="bh-section-count">{visible.length}</span>
      </div>
      {list}
    </div>
  );
}
