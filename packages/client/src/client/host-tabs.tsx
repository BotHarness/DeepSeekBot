import { useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { RemoteHost, RemoteConversationTarget } from './remote-hosts.js';
import { ALL_HOSTS, remoteHosts, THIS_HOST } from './remote-hosts.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { IconButton } from './ds/icon-button.js';
import { TextField } from './ds/field.js';
import { Tooltip } from './ds/tooltip.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';

const focusRing = { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` };

const styles = stylex.create({
  strip: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
    paddingBlock: space.x2,
    paddingInline: space.x3,
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x1,
    flexGrow: 1,
    minWidth: 0,
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  tab: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '160px',
    height: size.icon,
    paddingBlock: 0,
    paddingInline: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: { default: color.subtle, ':hover': color.fg },
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    outline: focusRing,
    outlineOffset: '-2px',
  },
  selected: {
    backgroundColor: { default: color.selected, ':hover': color.selected },
    color: { default: color.fg, ':hover': color.fg },
  },
  fixed: { flexShrink: 0 },
  offline: { opacity: 0.6 },
  icon: { display: 'inline-flex', flexShrink: 0 },
  label: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
  status: {
    margin: 0,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

interface ThisHostInfo {
  id?: string;
  name?: string;
}

let local: ThisHostInfo = {};
let localRequested = false;
const localListeners = new Set<() => void>();

function subscribeLocal(listener: () => void): () => void {
  localListeners.add(listener);
  if (!localRequested) {
    localRequested = true;
    void fetch('./api/botharness/devices')
      .then((response) => (response.ok ? response.json() : undefined))
      .then((value: { host?: { id?: unknown; name?: unknown } } | undefined) => {
        const host = value?.host;
        local = {
          ...(typeof host?.id === 'string' ? { id: host.id } : {}),
          ...(typeof host?.name === 'string' ? { name: host.name } : {}),
        };
        for (const notify of localListeners) notify();
      })
      .catch(() => {
        localRequested = false;
      });
  }
  return () => {
    localListeners.delete(listener);
  };
}

export function useThisHost(): ThisHostInfo {
  return useSyncExternalStore(
    subscribeLocal,
    () => local,
    () => local,
  );
}

export function useRemoteHosts() {
  const sources = remoteHosts();
  return useSyncExternalStore(sources.subscribe, sources.getSnapshot, sources.getSnapshot);
}

export function RemoteHostMark(): ReactElement {
  return (
    <span className="bh-muted-mark" aria-hidden="true" data-remote-host-mark="">
      <ChannelSidebarIcon name="monitor" size={12} />
    </span>
  );
}

function online(remote: RemoteHost): boolean {
  return remote.snapshot.connection.status === 'connected';
}

export function HostTabs({ t }: { t: BotHarnessTranslate }): ReactElement {
  const sources = remoteHosts();
  const snapshot = useRemoteHosts();
  const thisHost = useThisHost();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<RemoteHost | undefined>(undefined);
  const tabs: { id: string; label: string; icon: string; offline?: boolean }[] = [
    { id: ALL_HOSTS, label: t('remoteHosts.all'), icon: 'messages-square' },
    { id: THIS_HOST, label: t('remoteHosts.this'), icon: 'monitor' },
    ...snapshot.hosts.map((remote) => ({
      id: remote.host.hostId,
      label: remote.host.hostName,
      icon: 'monitor',
      offline: !online(remote),
    })),
  ];
  const selectedRemote = snapshot.hosts.find((remote) => remote.host.hostId === snapshot.tab);
  return (
    <>
      <div {...stylex.props(styles.strip)} data-host-tabs="">
        <div role="tablist" aria-label={t('remoteHosts.tabs')} {...stylex.props(styles.tabs)}>
          {tabs.map((tab) => {
            const selected = tab.id === snapshot.tab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                data-host-tab={tab.id}
                title={tab.offline ? t('remoteHosts.offline', { name: tab.label }) : tab.label}
                {...stylex.props(
                  styles.tab,
                  selected && styles.selected,
                  (selected || tab.id === ALL_HOSTS) && styles.fixed,
                  tab.offline === true && styles.offline,
                )}
                onClick={() => {
                  sources.select(tab.id);
                }}
                onContextMenu={(event) => {
                  const remote = snapshot.hosts.find(
                    (candidate) => candidate.host.hostId === tab.id,
                  );
                  if (remote === undefined) return;
                  event.preventDefault();
                  setRemoving(remote);
                }}
              >
                <span {...stylex.props(styles.icon)}>
                  <ChannelSidebarIcon name={tab.icon} />
                </span>
                <span {...stylex.props(styles.label)}>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <Tooltip label={t('remoteHosts.add')} side="bottom" delayMs={500}>
          <IconButton
            aria-label={t('remoteHosts.add')}
            data-remote-host-add=""
            onClick={() => setAdding(true)}
          >
            <ChannelSidebarIcon name="plus" />
          </IconButton>
        </Tooltip>
      </div>
      {selectedRemote !== undefined && !online(selectedRemote) ? (
        <p role="status" {...stylex.props(styles.status)}>
          {selectedRemote.snapshot.connection.status === 'refused'
            ? t('remoteHosts.refused', { name: selectedRemote.host.hostName })
            : t('remoteHosts.offline', { name: selectedRemote.host.hostName })}
        </p>
      ) : null}
      {adding ? (
        <AddRemoteHostDialog
          localId={thisHost.id}
          localName={thisHost.name}
          onClose={() => setAdding(false)}
          t={t}
        />
      ) : null}
      {removing === undefined ? null : (
        <ConfirmDialog
          title={t('remoteHosts.remove.title', { name: removing.host.hostName })}
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

function AddRemoteHostDialog({
  localId,
  localName,
  onClose,
  t,
}: {
  localId: string | undefined;
  localName: string | undefined;
  onClose: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const submit = (): void => {
    setBusy(true);
    setError(undefined);
    void remoteHosts()
      .pair(
        link,
        t('remoteHosts.deviceName', { name: localName ?? t('remoteHosts.this') }),
        localId,
      )
      .then((result) => {
        setBusy(false);
        if (result.ok) onClose();
        else setError(t(PAIR_ERRORS[result.code] ?? 'remoteHosts.error.unreachable'));
      });
  };
  return (
    <FormDialog
      title={t('remoteHosts.add')}
      description={t('remoteHosts.add.description')}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('remoteHosts.add.submit')}
      submitDisabled={link.trim().length === 0}
      busy={busy}
      error={error}
      onCancel={onClose}
      onSubmit={submit}
      submitData={{ 'data-remote-host-add-submit': '' }}
    >
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
  icon: string;
  preview?: string;
  previewAt?: string;
})[] {
  const roster = remote.snapshot.roster;
  if (roster === undefined) return [];
  const hostId = remote.host.hostId;
  return [
    ...roster.bots.map((bot) => ({
      key: `bot:${bot.slug}`,
      hostId,
      title: bot.displayName,
      botSlug: bot.slug,
      icon: 'bot',
      ...(bot.preview === undefined ? {} : { preview: bot.preview }),
      ...(bot.previewAt === undefined ? {} : { previewAt: bot.previewAt }),
    })),
    ...roster.channels.map((channel) => ({
      key: `channel:${channel.id}`,
      hostId,
      title: channel.name,
      channelId: channel.id,
      icon: 'users',
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
  const open = useRemoteHosts().open;
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
          className={`bh-channel-row${sameTarget(open, row) ? ' bh-selected' : ''}`}
          data-remote-row={row.key}
          aria-label={
            showSource
              ? t('remoteHosts.rowLabel', { name: row.title, host: remote.host.hostName })
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
            <span className="bh-channel-slot">
              <ChannelSidebarIcon name={row.icon} />
            </span>
          </span>
          <span className="bh-body">
            <span className="bh-top">
              <span className="bh-name">{row.title}</span>
              {showSource ? <RemoteHostMark /> : null}
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
        <span className="bh-section-name">{remote.host.hostName}</span>
        <span className="bh-section-count">{visible.length}</span>
      </div>
      {list}
    </div>
  );
}
