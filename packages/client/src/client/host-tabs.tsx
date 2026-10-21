import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { RemoteHost, RemoteConversationTarget } from './remote-hosts.js';
import { ALL_HOSTS, remoteHosts, THIS_HOST } from './remote-hosts.js';
import { UnreadCount } from './unread-count.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { RemoteAvatar } from './remote-avatar.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { PointerMenu, type MenuPoint } from './ds/pointer-menu.js';
import { TextField } from './ds/field.js';
import { Tooltip } from './ds/tooltip.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import {
  HOST_COLOR_IDS,
  HOST_COLORS,
  HOST_EMOJI,
  HOST_SYMBOL_IDS,
  type HostLook,
} from '../../../../apps/mobile/src/ui/design/host-look.js';
import { useBotColorScheme } from './bot-color-scheme.js';
import {
  HOST_SYMBOL_GLYPHS,
  hostLooks,
  unusedHostLook,
  useHostInk,
  useHostLook,
} from './host-looks.js';

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
  glyph: { display: 'inline-flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: text.titleSize, lineHeight: text.metaLine },
  ink: (value: string) => ({ color: value }),
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
  section: { display: 'flex', flexDirection: 'column', gap: space.x2 },
  sectionName: { color: color.subtle, fontSize: text.metaSize, lineHeight: text.metaLine },
  grid: { display: 'flex', flexWrap: 'wrap', gap: space.x1 },
  choice: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size.icon,
    height: size.icon,
    padding: 0,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: focusRing,
    outlineOffset: '-2px',
  },
  chosen: { borderColor: color.accent, backgroundColor: color.selected },
  swatch: (value: string) => ({
    width: '14px',
    height: '14px',
    borderRadius: radius.round,
    backgroundColor: value,
  }),
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

export function HostGlyph({ look, size: glyphSize = 16 }: { look: HostLook; size?: number }) {
  const ink = useHostInk(look.color);
  if (look.icon.kind === 'emoji')
    return (
      <span aria-hidden="true" {...stylex.props(styles.glyph, styles.emoji)}>
        {look.icon.emoji}
      </span>
    );
  return (
    <span aria-hidden="true" {...stylex.props(styles.glyph, ink !== undefined && styles.ink(ink))}>
      <ChannelSidebarIcon name={HOST_SYMBOL_GLYPHS[look.icon.id]} size={glyphSize} />
    </span>
  );
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

export function HostTabs({ t }: { t: BotHarnessTranslate }): ReactElement | null {
  const sources = remoteHosts();
  const snapshot = useRemoteHosts();
  const thisHost = useThisHost();
  const looks = hostLooks();
  useSyncExternalStore(
    looks.subscribe,
    () => looks,
    () => looks,
  );
  const [menu, setMenu] = useState<{ hostId: string; point: MenuPoint } | undefined>(undefined);
  const [removing, setRemoving] = useState<RemoteHost | undefined>(undefined);
  const [styling, setStyling] = useState<{ hostId: string; name: string } | undefined>(undefined);
  const proxy = useRef<HTMLSpanElement | null>(null);
  if (snapshot.hosts.length === 0) return null;
  const thisId = thisHost.id ?? THIS_HOST;
  const thisName = thisHost.name ?? t('remoteHosts.this');
  const selectedRemote = snapshot.hosts.find((remote) => remote.host.hostId === snapshot.tab);
  const menuRemote = snapshot.hosts.find((remote) => remote.host.hostId === menu?.hostId);
  const menuName = menuRemote?.host.hostName ?? thisName;
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
          look={looks.look(thisId)}
          selected={snapshot.tab === THIS_HOST}
          offline={false}
          unread={0}
          onMenu={(point) => setMenu({ hostId: thisId, point })}
        />
        {snapshot.hosts.map((remote) => {
          const unread = unreadCount(remote);
          const name = remote.host.hostName;
          return (
            <HostTab
              key={remote.host.hostId}
              id={remote.host.hostId}
              label={
                !online(remote)
                  ? t('remoteHosts.offline', { name })
                  : unread > 0
                    ? t('remoteHosts.unreadNamed', { name, count: unread })
                    : name
              }
              look={looks.look(remote.host.hostId)}
              selected={snapshot.tab === remote.host.hostId}
              offline={!online(remote)}
              unread={unread}
              onMenu={(point) => setMenu({ hostId: remote.host.hostId, point })}
            />
          );
        })}
      </div>
      {selectedRemote !== undefined && !online(selectedRemote) ? (
        <p role="status" {...stylex.props(styles.status)}>
          {selectedRemote.snapshot.connection.status === 'refused'
            ? t('remoteHosts.refused', { name: selectedRemote.host.hostName })
            : t('remoteHosts.offline', { name: selectedRemote.host.hostName })}
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
              { id: 'look', label: t('remoteHosts.look') },
              ...(menuRemote === undefined
                ? []
                : [{ id: 'remove', label: t('remoteHosts.remove.confirm'), danger: true }]),
            ]}
            onSelect={(id) => {
              setMenu(undefined);
              if (id === 'look') setStyling({ hostId: menu.hostId, name: menuName });
              if (id === 'remove' && menuRemote !== undefined) setRemoving(menuRemote);
            }}
            onClose={() => setMenu(undefined)}
          />
        </span>
      )}
      {styling === undefined ? null : (
        <HostLookDialog
          hostId={styling.hostId}
          name={styling.name}
          onClose={() => setStyling(undefined)}
          t={t}
        />
      )}
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

function HostLookDialog({
  hostId,
  name,
  onClose,
  t,
}: {
  hostId: string;
  name: string;
  onClose: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const scheme = useBotColorScheme();
  const [look, setLook] = useState<HostLook>(() => hostLooks().look(hostId));
  const icon = look.icon;
  return (
    <FormDialog
      title={t('remoteHosts.look.title', { name })}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('remoteHosts.look.save')}
      onCancel={onClose}
      onSubmit={() => {
        hostLooks().set(hostId, look);
        onClose();
      }}
    >
      <div {...stylex.props(styles.section)}>
        <span {...stylex.props(styles.sectionName)}>{t('remoteHosts.look.symbols')}</span>
        <div
          {...stylex.props(styles.grid)}
          role="radiogroup"
          aria-label={t('remoteHosts.look.symbols')}
        >
          {HOST_SYMBOL_IDS.map((id) => {
            const chosen = icon.kind === 'symbol' && icon.id === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={id}
                data-host-look-symbol={id}
                {...stylex.props(styles.choice, chosen && styles.chosen)}
                onClick={() => setLook({ ...look, icon: { kind: 'symbol', id } })}
              >
                <HostGlyph look={{ ...look, icon: { kind: 'symbol', id } }} />
              </button>
            );
          })}
        </div>
      </div>
      <div {...stylex.props(styles.section)}>
        <span {...stylex.props(styles.sectionName)}>{t('remoteHosts.look.emoji')}</span>
        <div
          {...stylex.props(styles.grid)}
          role="radiogroup"
          aria-label={t('remoteHosts.look.emoji')}
        >
          {HOST_EMOJI.map((emoji) => {
            const chosen = icon.kind === 'emoji' && icon.emoji === emoji;
            return (
              <button
                key={emoji}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={emoji}
                {...stylex.props(styles.choice, chosen && styles.chosen)}
                onClick={() => setLook({ ...look, icon: { kind: 'emoji', emoji } })}
              >
                <span {...stylex.props(styles.emoji)}>{emoji}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div {...stylex.props(styles.section)}>
        <span {...stylex.props(styles.sectionName)}>{t('remoteHosts.look.color')}</span>
        <div
          {...stylex.props(styles.grid)}
          role="radiogroup"
          aria-label={t('remoteHosts.look.color')}
        >
          <button
            type="button"
            role="radio"
            aria-checked={look.color === undefined}
            aria-label={t('remoteHosts.look.noColor')}
            {...stylex.props(styles.choice, look.color === undefined && styles.chosen)}
            onClick={() =>
              setLook({ ...(look.name === undefined ? {} : { name: look.name }), icon })
            }
          >
            <ChannelSidebarIcon name="ban" size={14} />
          </button>
          {HOST_COLOR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={look.color === id}
              aria-label={id}
              {...stylex.props(styles.choice, look.color === id && styles.chosen)}
              onClick={() => setLook({ ...look, color: id })}
            >
              <span {...stylex.props(styles.swatch(HOST_COLORS[id][scheme]))} />
            </button>
          ))}
        </div>
      </div>
    </FormDialog>
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
      .then((result) => {
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
        looks.set(result.host.hostId, unusedHostLook(used));
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
        <span className="bh-section-name">{remote.host.hostName}</span>
        <span className="bh-section-count">{visible.length}</span>
      </div>
      {list}
    </div>
  );
}
