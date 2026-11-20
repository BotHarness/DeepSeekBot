import * as stylex from '@stylexjs/stylex';
import { IconButton } from './ds/icon-button.js';
import { hooked } from './ds/hooked.js';
import { rosterStyles } from './ds/roster-styles.js';
import { Icon } from './ds/icon.js';
import { Button } from './ds/button.js';
import { UnreadCount } from './unread-count.js';
import { Menu } from './appearance-primitives.js';
import type { MouseEvent as ReactMouseEvent, Dispatch, SetStateAction } from 'react';
import { Tooltip } from './ds/tooltip.js';
import { PINNED_SORT_SCOPE_ID } from '@botharness/host-client/shared/bot-mode-settings';
import { PersonaBotAvatar, personaBotPresentationSummary } from './avatar.js';
import { sectionSortMode, type BotModePrefsSnapshot } from './bot-mode-prefs.js';
import { GroupChannelIcon } from './group-avatar-stack.js';
import { ChannelRowStatusGlyph, channelRowStatus } from './channel-row-status.js';
import type { ChannelDragProps, ScopeId } from './channel-drag.js';
import type { BotHarnessTranslate } from './locale.js';
import { personaBotActivity } from './persona-activity.js';
import { pinnedSortMenuItems } from './section-management.js';
import type { BotSummary, ChannelSummary } from './store.js';
import { RoleBadges } from './bot-sidebar-rows.js';
import type { SidebarState, ChannelMenuRequest } from './bot-sidebar-types.js';

import type { useSidebarPinZones } from './bot-sidebar-movement.js';

export function renderPinnedChannels({
  pinZones,
  hasPinnableChannels,
  allScope,
  hasPinnedChannels,
  t,
  commitPinDrop,
  pinSortMenuOpen,
  setPinSortMenuOpen,
  prefs,
  selectPinnedSortMenu,
  pinnedChannels,
  botBySlug,
  selectedChannel,
  selectedBot,
  channelDragProps,
  sectionOfChannel,
  state,
  selectedChannelSet,
  showShortcutHints,
  shortcutFor,
  activateChannel,
  startPinDrag,
  endPinDrag,
  commitPinnedReorder,
  openChannelMenu,
  channelUnread,
  listNow,
  mutedChannelSet,
}: {
  pinZones: ReturnType<typeof useSidebarPinZones>;
  hasPinnableChannels: boolean;
  allScope: boolean;
  hasPinnedChannels: boolean;
  t: BotHarnessTranslate;
  commitPinDrop: (pinned: boolean) => void;
  pinSortMenuOpen: boolean;
  setPinSortMenuOpen: Dispatch<SetStateAction<boolean>>;
  prefs: BotModePrefsSnapshot;
  selectPinnedSortMenu: (id: string) => void;
  pinnedChannels: ChannelSummary[];
  botBySlug: ReadonlyMap<string, BotSummary>;
  selectedChannel: string | undefined;
  selectedBot: string | undefined;
  channelDragProps: (scopeId: ScopeId, channelId: string) => ChannelDragProps;
  sectionOfChannel: (channelId: string) => string | undefined;
  state: SidebarState;
  selectedChannelSet: Set<string>;
  showShortcutHints: boolean;
  shortcutFor: (channelId: string) => string | undefined;
  activateChannel: (channel: ChannelSummary, event: ReactMouseEvent<HTMLButtonElement>) => void;
  startPinDrag: (channelId: string, source: 'roster' | 'pinned') => void;
  endPinDrag: () => void;
  commitPinnedReorder: (sourceId: string, targetId: string, half: 'before' | 'after') => void;
  openChannelMenu: (request: ChannelMenuRequest) => void;
  channelUnread: Readonly<Record<string, number>>;
  listNow: number;
  mutedChannelSet: Set<string>;
}) {
  const {
    pinDrag,
    pinReorderTarget,
    setPinReorderTarget,
    pinZoneArmed,
    pinZoneHovered,
    setPinZoneHovered,
  } = pinZones;
  return hasPinnableChannels && !allScope ? (
    <div
      className={`bh-pin-zone${hasPinnedChannels ? ' bh-pin-zone-filled' : ' bh-pin-zone-empty'}${!hasPinnedChannels && !pinZoneArmed ? ' bh-pin-zone-hidden' : ''}${pinZoneHovered ? ' bh-pin-zone-active' : ''}`}
      role="region"
      aria-label={t('pin.zone.label')}
      aria-hidden={!hasPinnedChannels && !pinZoneArmed}
      onDragOver={(event) => {
        if (pinDrag?.source === 'pinned') {
          setPinReorderTarget(undefined);
          return;
        }
        if (pinDrag?.source !== 'roster') return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        setPinZoneHovered(true);
      }}
      onDragLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return;
        }
        setPinZoneHovered(false);
      }}
      onDrop={(event) => {
        if (pinDrag?.source !== 'roster') return;
        event.preventDefault();
        event.stopPropagation();
        commitPinDrop(true);
      }}
    >
      {!hasPinnedChannels ? (
        <span className="bh-pin-zone-hint">{t('pin.drop')}</span>
      ) : (
        <div {...hooked('bh-pinned-grid', rosterStyles.pinnedGrid)}>
          <div {...stylex.props(rosterStyles.pinnedHeading)}>
            <span>{t('pin.title')}</span>
            <Menu
              open={pinSortMenuOpen}
              portal
              dense
              align="end"
              anchor={
                <IconButton
                  size="inline"
                  type="button"
                  aria-label={t('pin.sort')}
                  aria-expanded={pinSortMenuOpen}
                  onClick={() => setPinSortMenuOpen((value) => !value)}
                >
                  <Icon name="ellipsis" />
                </IconButton>
              }
              items={pinnedSortMenuItems(t)}
              selectedId={sectionSortMode(prefs, PINNED_SORT_SCOPE_ID)}
              onSelect={selectPinnedSortMenu}
              onClose={() => setPinSortMenuOpen(false)}
            />
          </div>
          {pinnedChannels.map((channel) => {
            const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
            const selected =
              selectedChannel === channel.id || (bot !== undefined && selectedBot === bot.slug);
            const dragSource = pinDrag?.source === 'pinned' && pinDrag.channelId === channel.id;
            const channelDrag = channelDragProps(sectionOfChannel(channel.id), channel.id);
            const pinMarker =
              pinReorderTarget?.channelId === channel.id ? pinReorderTarget.half : null;
            return (
              <Tooltip
                key={channel.id}
                label={
                  bot === undefined
                    ? channel.name
                    : `${bot.displayName} · ${personaBotPresentationSummary(personaBotActivity(state, bot), bot.activity, bot.attention, t)}`
                }
                side="right"
                delayMs={350}
              >
                <Button
                  type="button"
                  xstyle={[
                    rosterStyles.pinnedTile,
                    (selected || selectedChannelSet.has(channel.id)) && rosterStyles.selected,
                    dragSource && rosterStyles.dragging,
                  ]}
                  data-channel-id={channel.id}
                  className={`bh-pinned${selected ? ' bh-selected' : ''}${selectedChannelSet.has(channel.id) ? ' bh-multi-selected' : ''}${showShortcutHints && shortcutFor(channel.id) !== undefined ? ' bh-shortcut-active' : ''}${dragSource ? ' bh-drag-source' : ''}${pinMarker === null ? '' : ` bh-pin-drop-${pinMarker}`}`}
                  aria-pressed={selectedChannelSet.has(channel.id)}
                  aria-keyshortcuts={shortcutFor(channel.id)}
                  title={
                    shortcutFor(channel.id) === undefined
                      ? undefined
                      : t('shortcut.web.open', {
                          key: shortcutFor(channel.id) ?? '',
                        })
                  }
                  onClick={(event) => activateChannel(channel, event)}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', channel.id);
                    channelDrag.start();
                    startPinDrag(channel.id, 'pinned');
                  }}
                  onDragEnd={() => {
                    channelDrag.end();
                    endPinDrag();
                  }}
                  onDragOver={(event) => {
                    if (pinDrag?.source !== 'pinned' || pinDrag.channelId === channel.id) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = 'move';
                    const rect = event.currentTarget.getBoundingClientRect();
                    setPinReorderTarget({
                      channelId: channel.id,
                      half: event.clientX < rect.left + rect.width / 2 ? 'before' : 'after',
                    });
                  }}
                  onDragLeave={(event) => {
                    if (
                      event.relatedTarget instanceof Node &&
                      event.currentTarget.contains(event.relatedTarget)
                    ) {
                      return;
                    }
                    setPinReorderTarget((current) =>
                      current?.channelId === channel.id ? undefined : current,
                    );
                  }}
                  onDrop={(event) => {
                    if (pinDrag?.source !== 'pinned' || pinDrag.channelId === channel.id) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    commitPinnedReorder(
                      pinDrag.channelId,
                      channel.id,
                      event.clientX < rect.left + rect.width / 2 ? 'before' : 'after',
                    );
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openChannelMenu({
                      channelId: channel.id,
                      pinnedView: true,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  onKeyDown={(event) => {
                    const keyboardMenu =
                      event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
                    if (!keyboardMenu) return;
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    openChannelMenu({
                      channelId: channel.id,
                      pinnedView: true,
                      x: rect.left + 8,
                      y: rect.bottom,
                    });
                  }}
                >
                  {pinMarker === null ? null : (
                    <span
                      aria-hidden="true"
                      {...stylex.props(
                        rosterStyles.insertion,
                        pinMarker === 'before'
                          ? rosterStyles.insertionBefore
                          : rosterStyles.insertionAfter,
                      )}
                    />
                  )}
                  {bot === undefined ? (
                    <span {...stylex.props(rosterStyles.pinnedIcon)}>
                      <GroupChannelIcon
                        channel={channel}
                        bots={botBySlug}
                        className="bh-pinned-channel-icon"
                        groupClassName="bh-group-pinned-channel-icon"
                        size={54}
                        hashSize={24}
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
                      state={personaBotActivity(state, bot)}
                      activity={bot.activity}
                      attention={bot.attention}
                      size={54}
                      indicator={false}
                    />
                  )}
                  <span {...hooked('bh-name', rosterStyles.pinnedLabel)}>
                    {bot?.displayName ?? channel.name}
                    {bot === undefined ? null : (
                      <ChannelRowStatusGlyph
                        status={channelRowStatus({
                          activity: personaBotActivity(state, bot),
                          attention: bot.attention,
                          paused: bot.paused,
                          unread: channelUnread[channel.id] ?? 0,
                          botSlug: bot.slug,
                          latest: channel.latestMessage,
                          now: listNow,
                        })}
                        t={t}
                      />
                    )}
                  </span>
                  {bot === undefined ? null : <RoleBadges roles={bot.roles} />}
                  <UnreadCount
                    count={channelUnread[channel.id] ?? 0}
                    muted={mutedChannelSet.has(channel.id)}
                    t={t}
                  />
                  {showShortcutHints && shortcutFor(channel.id) !== undefined ? (
                    <kbd className="bh-shortcut-badge" aria-hidden="true">
                      {shortcutFor(channel.id)?.slice(4)}
                    </kbd>
                  ) : null}
                </Button>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  ) : null;
}

export function renderUnpinZone({
  pinZones,
  t,
  clearGapHover,
  commitPinDrop,
}: {
  pinZones: ReturnType<typeof useSidebarPinZones>;
  t: BotHarnessTranslate;
  clearGapHover: () => void;
  commitPinDrop: (pinned: boolean) => void;
}) {
  const { pinDrag, unpinZoneArmed, unpinZoneHovered, setUnpinZoneHovered } = pinZones;
  return (
    <div
      className={`bh-unpin-zone${!unpinZoneArmed ? ' bh-unpin-zone-hidden' : ''}${unpinZoneHovered ? ' bh-unpin-zone-active' : ''}`}
      role="region"
      aria-label={t('pin.restore.zone.label')}
      aria-hidden={!unpinZoneArmed}
      onDragOver={(event) => {
        if (pinDrag?.source !== 'pinned') return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        clearGapHover();
        setUnpinZoneHovered(true);
      }}
      onDragLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return;
        }
        setUnpinZoneHovered(false);
      }}
      onDrop={(event) => {
        if (pinDrag?.source !== 'pinned') return;
        event.preventDefault();
        event.stopPropagation();
        commitPinDrop(false);
      }}
    >
      <span className="bh-unpin-zone-hint">
        {t(unpinZoneHovered ? 'pin.restore.release' : 'pin.restore.drop')}
      </span>
    </div>
  );
}
