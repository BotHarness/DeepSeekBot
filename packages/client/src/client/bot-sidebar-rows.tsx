import { toolApprovalText } from './approval-text.js';
import { voiceCallRecordText } from './voice-call-record.js';
import { turnStopText } from './turn-stop.js';
import { attachmentReferenceLabels } from './attachment-refs.js';
import { humanIdOf, selfHumanId } from './self-human.js';
import * as stylex from '@stylexjs/stylex';
import { hooked } from './ds/hooked.js';
import { avatarFrameStyles } from './ds/avatar-frame.js';
import { CHANNEL_LIST_AVATAR_SIZE, rosterStyles } from './ds/roster-styles.js';
import { Tag } from './ds/tag.js';
import { Button } from './ds/button.js';
import { NavItem } from './ds/nav-item.js';
import { isHumanDmChannel } from './channel-kind.js';
import { UnreadCount } from './unread-count.js';
import { HostMark } from './host-tabs.js';
import { memo, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { HoverCard } from './ds/hover-card.js';
import { Tooltip } from './ds/tooltip.js';
import type { BridgeActions } from './actions.js';
import {
  PersonaBotAvatar,
  personaBotPresentationSummary,
  type PersonaBotActivityState,
} from './avatar.js';
import { GroupChannelIcon } from './group-avatar-stack.js';
import {
  ChannelRowStatusGlyph,
  channelRowStatus,
  formatChannelListTime,
  useMinuteNow,
} from './channel-row-status.js';
import type { ChannelDragProps, ScopeId } from './channel-drag.js';
import type { BotHarnessTranslate } from './locale.js';
import { personaBotActivity } from './persona-activity.js';
import {
  liveRowCallbacks,
  sameSidebarRowProps,
  type RowCallbacks,
  type RowLatest,
} from './sidebar-row-memo.js';
import { rowDropHalf } from './roster-order.js';
import type { BotSummary, ChannelSummary } from './store.js';
import type { SidebarState, ChannelMenuRequest } from './bot-sidebar-types.js';
import type { SidebarControls } from './bot-sidebar.js';

export function RoleBadges({ roles }: { roles: readonly string[] }): ReactElement | null {
  if (roles.length === 0) return null;
  return (
    <span className="bh-role-badges">
      {roles.map((role) => (
        <Tag key={role} tone="neutral">
          {role}
        </Tag>
      ))}
    </span>
  );
}

function ChannelMessageTime({
  channel,
  now,
  t,
}: {
  channel: ChannelSummary;
  now: number;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const at = channel.latestMessage?.at;
  if (at === undefined) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <time className="bh-channel-message-time" dateTime={at} title={date.toLocaleString()}>
      {formatChannelListTime(date.getTime(), now, t)}
    </time>
  );
}

function MutedMark({
  t,
  renderSidebarIcon,
}: {
  t: BotHarnessTranslate;
  renderSidebarIcon: SidebarControls['renderSidebarIcon'];
}): ReactElement {
  return (
    <span className="bh-muted-mark" role="img" aria-label={t('roster.muted')}>
      {renderSidebarIcon({ name: 'bell-off', size: 12 })}
    </span>
  );
}

interface LatestRowProps {
  latest: RowLatest<ChannelMenuRequest>;
  latestKey: string;
}

const MemoBotRow = memo(function MemoBotRow({
  latest,
  latestKey,
  ...props
}: Parameters<typeof BotRow>[0] & LatestRowProps): ReactElement {
  return <BotRow {...liveRowCallbacks(props, latest, latestKey)} />;
}, sameSidebarRowProps);

const MemoChannelRow = memo(function MemoChannelRow({
  latest,
  latestKey,
  ...props
}: Parameters<typeof ChannelRow>[0] & LatestRowProps): ReactElement {
  return <ChannelRow {...liveRowCallbacks(props, latest, latestKey)} />;
}, sameSidebarRowProps);

function BotRow({
  renderSidebarIcon,
  bot,
  channel,
  preview,
  unread,
  muted,
  activity,
  selected,
  multiSelected,
  onActivate,
  shortcut,
  showShortcutHints,
  drag,
  onMenu,
  onPinDragStart,
  onPinDragEnd,
  source = false,
  t,
}: {
  renderSidebarIcon: SidebarControls['renderSidebarIcon'];
  bot: BotSummary;
  channel: ChannelSummary;
  preview: string;
  unread: number;
  muted: boolean;
  activity: PersonaBotActivityState;
  selected: boolean;
  multiSelected: boolean;
  onActivate: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  shortcut?: string | undefined;
  showShortcutHints: boolean;
  drag?: ChannelDragProps | undefined;
  onMenu: (request: ChannelMenuRequest) => void;
  onPinDragStart: (channelId: string) => void;
  onPinDragEnd: () => void;
  source?: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const now = useMinuteNow();
  const status = channelRowStatus({
    activity,
    attention: bot.attention,
    paused: bot.paused,
    unread,
    botSlug: bot.slug,
    latest: channel.latestMessage,
    now,
  });
  const markerClass =
    drag?.marker === 'before'
      ? ' bh-drop-before'
      : drag?.marker === 'after'
        ? ' bh-drop-after'
        : '';
  const sourceClass = drag?.source ? ' bh-drag-source' : '';
  return (
    <Tooltip
      label={`${bot.displayName} · ${personaBotPresentationSummary(activity, bot.activity, bot.attention, t)}`}
      side="right"
      delayMs={350}
    >
      <NavItem
        multiline
        largeIcon
        current={selected}
        data={{ 'data-channel-id': channel.id }}
        className={`bh-contact${unread > 0 ? ' bh-has-unread' : ''}${bot.paused ? ' bh-paused' : ''}${muted ? ' bh-muted' : ''}${showShortcutHints && shortcut !== undefined ? ' bh-shortcut-active' : ''}${markerClass}${sourceClass}`}
        aria-pressed={multiSelected}
        aria-keyshortcuts={shortcut}
        title={shortcut === undefined ? undefined : t('shortcut.web.open', { key: shortcut })}
        onSelect={onActivate}
        draggable={drag !== undefined}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', channel.id);
          drag?.start();
          onPinDragStart(channel.id);
        }}
        onDragEnd={() => {
          drag?.end();
          onPinDragEnd();
        }}
        onDragOver={(event) => {
          if (!drag?.active) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          drag.hover(rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()));
        }}
        onDrop={(event) => {
          if (!drag?.active) return;
          event.preventDefault();
          event.stopPropagation();
          drag.drop(rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()));
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu({ channelId: channel.id, x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event) => {
          const keyboardMenu =
            event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
          if (!keyboardMenu) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          onMenu({ channelId: channel.id, x: rect.left + 8, y: rect.bottom });
        }}
        iconDecorative={false}
        icon={
          <span {...hooked('bh-row-avatar', avatarFrameStyles.channel)}>
            <PersonaBotAvatar
              t={t}
              personaBotId={bot.slug}
              name={bot.displayName}
              src={bot.avatar}
              appearance={bot.appearance}
              avatarSeed={bot.avatarSeed}
              state={activity}
              activity={bot?.activity}
              attention={bot?.attention}
              size={CHANNEL_LIST_AVATAR_SIZE}
              squareBackdrop
              indicator={false}
              still
            />
          </span>
        }
        label={
          <span className="bh-body">
            <span className="bh-top">
              <span className="bh-name">{bot.displayName}</span>
              {muted ? <MutedMark t={t} renderSidebarIcon={renderSidebarIcon} /> : null}
              <ChannelMessageTime channel={channel} now={now} t={t} />
            </span>
            <span className="bh-bottom">
              <span className="bh-msg">{preview}</span>
              {source ? <HostMark /> : null}
              <UnreadCount count={unread} muted={muted} t={t} />
              <ChannelRowStatusGlyph status={status} t={t} />
            </span>
          </span>
        }
        trailing={
          showShortcutHints && shortcut !== undefined ? (
            <kbd className="bh-shortcut-badge" aria-hidden="true">
              {shortcut.slice(4)}
            </kbd>
          ) : null
        }
      />
    </Tooltip>
  );
}
function ChannelRow({
  renderSidebarIcon,
  channel,
  bots,
  preview,
  unread,
  muted,
  selected,
  multiSelected,
  onActivate,
  shortcut,
  showShortcutHints,
  drag,
  onMenu,
  onPinDragStart,
  onPinDragEnd,
  source = false,
  t,
}: {
  renderSidebarIcon: SidebarControls['renderSidebarIcon'];
  channel: ChannelSummary;
  bots: ReadonlyMap<string, BotSummary>;
  preview: string;
  unread: number;
  muted: boolean;
  selected: boolean;
  multiSelected: boolean;
  onActivate: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  shortcut?: string | undefined;
  showShortcutHints: boolean;
  drag?: ChannelDragProps | undefined;
  onMenu: (request: ChannelMenuRequest) => void;
  onPinDragStart?: ((channelId: string) => void) | undefined;
  onPinDragEnd?: (() => void) | undefined;
  source?: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const now = useMinuteNow();
  const marker = drag?.marker ?? null;
  const markerClass =
    marker === 'before' ? ' bh-drop-before' : marker === 'after' ? ' bh-drop-after' : '';
  const sourceClass = drag?.source === true ? ' bh-drag-source' : '';
  return (
    <NavItem
      multiline
      largeIcon
      current={selected}
      data={{ 'data-channel-id': channel.id }}
      className={`bh-channel-row${unread > 0 ? ' bh-has-unread' : ''}${muted ? ' bh-muted' : ''}${showShortcutHints && shortcut !== undefined ? ' bh-shortcut-active' : ''}${markerClass}${sourceClass}`}
      aria-pressed={multiSelected}
      aria-keyshortcuts={shortcut}
      title={shortcut === undefined ? undefined : t('shortcut.web.open', { key: shortcut })}
      onSelect={onActivate}
      draggable={drag !== undefined}
      onDragStart={
        drag === undefined
          ? undefined
          : (event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', channel.id);
              drag.start();
              onPinDragStart?.(channel.id);
            }
      }
      onDragEnd={
        drag === undefined
          ? undefined
          : () => {
              drag.end();
              onPinDragEnd?.();
            }
      }
      onDragOver={
        drag === undefined
          ? undefined
          : (event) => {
              if (!drag.active) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              drag.hover(rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()));
            }
      }
      onDrop={
        drag === undefined
          ? undefined
          : (event) => {
              if (!drag.active) return;
              event.preventDefault();
              event.stopPropagation();
              drag.drop(rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()));
            }
      }
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ channelId: channel.id, x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        const keyboardMenu = event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
        if (!keyboardMenu) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onMenu({ channelId: channel.id, x: rect.left + 8, y: rect.bottom });
      }}
      icon={
        <span {...hooked('bh-row-avatar', avatarFrameStyles.channel)}>
          {isHumanDmChannel(channel) ? (
            <span className="bh-channel-slot" aria-hidden="true">
              {renderSidebarIcon({ name: 'user', size: 16 })}
            </span>
          ) : (
            <GroupChannelIcon
              channel={channel}
              bots={bots}
              className="bh-channel-slot"
              groupClassName="bh-group-channel-slot"
              size={CHANNEL_LIST_AVATAR_SIZE}
              hashSize={16}
              t={t}
            />
          )}
        </span>
      }
      label={
        <span className="bh-body">
          <span className="bh-top">
            <span className="bh-name">{channel.name}</span>
            {muted ? <MutedMark t={t} renderSidebarIcon={renderSidebarIcon} /> : null}
            <ChannelMessageTime channel={channel} now={now} t={t} />
          </span>
          <span className="bh-bottom">
            <span className="bh-msg">{preview}</span>
            {source ? <HostMark /> : null}
            <UnreadCount count={unread} muted={muted} t={t} />
          </span>
        </span>
      }
      trailing={
        showShortcutHints && shortcut !== undefined ? (
          <kbd className="bh-shortcut-badge" aria-hidden="true">
            {shortcut.slice(4)}
          </kbd>
        ) : null
      }
    />
  );
}

function RailChannel({
  channel,
  bots,
  bot,
  activity,
  unread,
  muted,
  selected,
  shortcut,
  showShortcutHints,
  summary,
  actions,
  t,
}: {
  channel: ChannelSummary;
  bots: ReadonlyMap<string, BotSummary>;
  bot: BotSummary | undefined;
  activity: PersonaBotActivityState | undefined;
  unread: number;
  muted: boolean;
  selected: boolean;
  shortcut?: string | undefined;
  showShortcutHints: boolean;
  summary: string;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const title = bot?.displayName ?? channel.name;
  const open = (): void => {
    void (bot === undefined ? actions.openChannel(channel.id) : actions.openBot(bot.slug));
  };
  return (
    <HoverCard
      inline
      openDelayMs={350}
      copyLabel={t('rail.copy')}
      copiedLabel={t('rail.copied')}
      anchor={
        <Button
          type="button"
          xstyle={[rosterStyles.railRow, selected && rosterStyles.selected]}
          className={`bh-rail-channel${selected ? ' bh-selected' : ''}${showShortcutHints && shortcut !== undefined ? ' bh-shortcut-active' : ''}`}
          data-channel-id={channel.id}
          aria-label={
            bot === undefined
              ? title
              : `${title} · ${personaBotPresentationSummary(activity ?? 'idle', bot.activity, bot.attention, t)}`
          }
          aria-current={selected ? 'page' : undefined}
          aria-keyshortcuts={shortcut}
          onClick={open}
        >
          {bot === undefined ? (
            <span {...stylex.props(rosterStyles.railIcon)}>
              <GroupChannelIcon
                channel={channel}
                bots={bots}
                className="bh-rail-channel-icon"
                groupClassName="bh-group-channel-icon"
                size={32}
                hashSize={18}
                t={t}
              />
            </span>
          ) : (
            <PersonaBotAvatar
              t={t}
              personaBotId={bot.slug}
              name={bot.displayName}
              src={bot.avatar}
              appearance={bot.appearance}
              avatarSeed={bot.avatarSeed}
              state={activity}
              activity={bot?.activity}
              attention={bot?.attention}
              size={32}
            />
          )}
          <UnreadCount count={unread} muted={muted} t={t} />
          {showShortcutHints && shortcut !== undefined ? (
            <kbd className="bh-shortcut-badge" aria-hidden="true">
              {shortcut.slice(4)}
            </kbd>
          ) : null}
        </Button>
      }
      content={
        <div className="bh-rail-preview">
          <div className="bh-rail-preview-head">
            {bot === undefined ? (
              <GroupChannelIcon
                channel={channel}
                bots={bots}
                className="bh-rail-preview-icon"
                groupClassName="bh-group-channel-icon"
                size={24}
                hashSize={16}
                t={t}
              />
            ) : (
              <PersonaBotAvatar
                t={t}
                personaBotId={bot.slug}
                name={bot.displayName}
                src={bot.avatar}
                appearance={bot.appearance}
                avatarSeed={bot.avatarSeed}
                state={activity}
                activity={bot?.activity}
                attention={bot?.attention}
                size={24}
                indicator={false}
              />
            )}
            <span className="bh-rail-preview-title">{title}</span>
          </div>
          {bot !== undefined && bot.roles.length > 0 ? (
            <span className="bh-rail-preview-meta">{bot.roles.join(' · ')}</span>
          ) : null}
          {bot?.description === undefined ? null : (
            <span className="bh-rail-preview-description">{bot.description}</span>
          )}
          <span className="bh-rail-preview-summary">{summary}</span>
          {bot === undefined ? null : (
            <span>
              {personaBotPresentationSummary(activity ?? 'idle', bot.activity, bot.attention, t)}
            </span>
          )}
          {shortcut === undefined ? null : (
            <span className="bh-rail-preview-meta">
              {t('shortcut.web.open', { key: shortcut })}
            </span>
          )}
        </div>
      }
    />
  );
}

export function createSidebarRowRenderer({
  allScope,
  channelDragProps,
  botBySlug,
  t,
  startPinDrag,
  activateChannel,
  openChannelMenu,
  allPinnedChannelSet,
  endPinDrag,
  rowCallbacks,
  rowLatest,
  channelUnread,
  mutedChannelSet,
  state,
  selectedBot,
  selectedChannel,
  selectedChannelSet,
  shortcutFor,
  showShortcutHints,
  showSource,
  renderSidebarIcon,
  plainMarkdown,
}: {
  allScope: boolean;
  channelDragProps: (scopeId: ScopeId, channelId: string) => ChannelDragProps;
  botBySlug: ReadonlyMap<string, BotSummary>;
  t: BotHarnessTranslate;
  startPinDrag: (channelId: string, source: 'roster' | 'pinned') => void;
  activateChannel: (channel: ChannelSummary, event: ReactMouseEvent<HTMLButtonElement>) => void;
  openChannelMenu: (request: ChannelMenuRequest) => void;
  allPinnedChannelSet: Set<string>;
  endPinDrag: () => void;
  rowCallbacks: Map<string, RowCallbacks<ChannelMenuRequest>>;
  rowLatest: RowLatest<ChannelMenuRequest>;
  channelUnread: Readonly<Record<string, number>>;
  mutedChannelSet: Set<string>;
  state: SidebarState;
  selectedBot: string | undefined;
  selectedChannel: string | undefined;
  selectedChannelSet: Set<string>;
  shortcutFor: (channelId: string) => string | undefined;
  showShortcutHints: boolean;
  showSource: boolean;
  renderSidebarIcon: SidebarControls['renderSidebarIcon'];
  plainMarkdown: SidebarControls['plainMarkdown'];
}) {
  return (channel: ChannelSummary, scopeId: ScopeId): ReactElement => {
    const drag = allScope ? undefined : channelDragProps(scopeId, channel.id);
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    const preview = channelPreview(channel, botBySlug, t, plainMarkdown);
    const latestKey = `${scopeId ?? ''}:${channel.id}`;
    const pinDragStart = (channelId: string): void => {
      if (!allScope) startPinDrag(channelId, 'roster');
    };
    const callbacks: RowCallbacks<ChannelMenuRequest> = {
      onActivate: (event) => activateChannel(channel, event),
      onMenu: (request) =>
        openChannelMenu({
          ...request,
          pinnedView: allPinnedChannelSet.has(channel.id),
        }),
      onPinDragStart: pinDragStart,
      onPinDragEnd: endPinDrag,
      drag,
    };
    rowCallbacks.set(latestKey, callbacks);
    if (channel.type === 'dm' && bot !== undefined) {
      return (
        <MemoBotRow
          renderSidebarIcon={renderSidebarIcon}
          t={t}
          key={channel.id}
          latest={rowLatest}
          latestKey={latestKey}
          bot={bot}
          channel={channel}
          preview={preview}
          unread={channelUnread[channel.id] ?? 0}
          muted={mutedChannelSet.has(channel.id)}
          activity={personaBotActivity(state, bot)}
          selected={selectedBot === bot.slug || selectedChannel === channel.id}
          multiSelected={selectedChannelSet.has(channel.id)}
          onActivate={callbacks.onActivate}
          shortcut={shortcutFor(channel.id)}
          showShortcutHints={showShortcutHints}
          drag={drag}
          onMenu={callbacks.onMenu}
          onPinDragStart={pinDragStart}
          onPinDragEnd={endPinDrag}
          source={showSource}
        />
      );
    }
    return (
      <MemoChannelRow
        renderSidebarIcon={renderSidebarIcon}
        t={t}
        source={showSource}
        key={channel.id}
        latest={rowLatest}
        latestKey={latestKey}
        channel={channel}
        bots={botBySlug}
        preview={preview}
        unread={channelUnread[channel.id] ?? 0}
        muted={mutedChannelSet.has(channel.id)}
        selected={selectedChannel === channel.id}
        multiSelected={selectedChannelSet.has(channel.id)}
        onActivate={callbacks.onActivate}
        shortcut={shortcutFor(channel.id)}
        showShortcutHints={showShortcutHints}
        drag={drag}
        onMenu={callbacks.onMenu}
        onPinDragStart={pinDragStart}
        onPinDragEnd={endPinDrag}
      />
    );
  };
}

export function renderSidebarRail({
  botBySlug,
  state,
  channelUnread,
  mutedChannelSet,
  selectedChannel,
  selectedBot,
  t,
  shortcutFor,
  showShortcutHints,
  actions,
  railPinnedChannels,
  railChannels,
  plainMarkdown,
}: {
  botBySlug: ReadonlyMap<string, BotSummary>;
  state: SidebarState;
  channelUnread: Readonly<Record<string, number>>;
  mutedChannelSet: Set<string>;
  selectedChannel: string | undefined;
  selectedBot: string | undefined;
  t: BotHarnessTranslate;
  shortcutFor: (channelId: string) => string | undefined;
  showShortcutHints: boolean;
  actions: BridgeActions;
  railPinnedChannels: ChannelSummary[];
  railChannels: ChannelSummary[];
  plainMarkdown: SidebarControls['plainMarkdown'];
}): ReactElement {
  const renderRailChannel = (channel: ChannelSummary): ReactElement => {
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    return (
      <RailChannel
        key={channel.id}
        channel={channel}
        bots={botBySlug}
        bot={bot}
        activity={bot === undefined ? undefined : personaBotActivity(state, bot)}
        unread={channelUnread[channel.id] ?? 0}
        muted={mutedChannelSet.has(channel.id)}
        selected={selectedChannel === channel.id || (bot !== undefined && selectedBot === bot.slug)}
        summary={channelPreview(channel, botBySlug, t, plainMarkdown)}
        shortcut={shortcutFor(channel.id)}
        showShortcutHints={showShortcutHints}
        actions={actions}
        t={t}
      />
    );
  };
  return (
    <div
      className="bh-root bh-region bh-region-rail"
      aria-label={t('rail.label')}
      data-bh-tour="roster"
    >
      <div {...hooked('bh-rail-group', rosterStyles.railGroup)}>
        {railPinnedChannels.map((channel) => renderRailChannel(channel))}
      </div>
      <div
        {...hooked(
          'bh-rail-group',
          rosterStyles.railGroup,
          railPinnedChannels.length > 0 && railChannels.length > 0 && rosterStyles.railUnpinned,
        )}
        data-rail-unpinned=""
      >
        {railChannels.map((channel) => renderRailChannel(channel))}
      </div>
    </div>
  );
}

function channelPreview(
  channel: ChannelSummary,
  bots: ReadonlyMap<string, BotSummary>,
  t: BotHarnessTranslate,
  plainMarkdown: SidebarControls['plainMarkdown'],
): string {
  const message = channel.latestMessage;
  if (message?.contentPurged) return t('purge.purged');
  if (message === undefined) return t('rail.noMessages');
  if (message.turnStop !== undefined) return turnStopText(message.turnStop, t);
  if (message.voiceCallRecord !== undefined) return voiceCallRecordText(message.voiceCallRecord, t);
  if (message.memberDeparture !== undefined)
    return t(
      message.memberDeparture.departureType === 'removed' ? 'member.removed' : 'member.left',
      { name: message.memberDeparture.displayName },
    );
  const body =
    (message.approval?.masked === true
      ? t(`approval.masked.${message.approval.kind}`)
      : undefined) ??
    toolApprovalText(message, t) ??
    (plainMarkdown(attachmentReferenceLabels(message.body, message.attachments ?? []))
      .replace(/\s+/gu, ' ')
      .trim() ||
      message.attachments?.[0]?.name ||
      t('roster.latestActivity'));
  const author =
    message.author.kind === 'human'
      ? message.author.deleted === true
        ? t('team.deletedMember')
        : humanIdOf(message.author) === selfHumanId()
          ? t('rail.you')
          : (message.author.displayName ?? t('team.otherMember'))
      : message.author.kind === 'bot'
        ? (bots.get(message.author.slug)?.displayName ??
          message.author.displayName ??
          t('team.someBot'))
        : message.author.kind === 'bridged'
          ? message.author.source
          : undefined;
  return author === undefined ? body : `${author}：${body}`;
}
