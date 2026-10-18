import { PointerMenu } from './ds/pointer-menu.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { ChannelHistory } from './channel-history.js';
import { attachmentReferenceLabels } from './attachment-refs.js';
import {
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';

import {
  Button,
  IconAgentPresetOutlineRegular,
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconCloseFillRegular,
  IconEditOutlineRegular,
  IconEllipsisOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconGlobeOutlineRegular,
  IconNewChatOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconPlusOutlineRegular,
  IconSearchOutlineRegular,
  IconSettingsOutlineRegular,
  IconShareOutlineRegular,
  IconTrashOutlineRegular,
  HoverCard,
  Menu,
  MenuItemButton,
  Tag,
  Toast,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';

import {
  isBotModeSortMode,
  PINNED_SORT_SCOPE_ID,
  type BotModeSortMode,
} from '../bot-mode-settings.js';
import type { BridgeActions } from './actions.js';
import type { WindowCompanions } from './window-companions.js';
import {
  PersonaBotAvatar,
  PersonaBotStatusBadges,
  personaBotPresentationSummary,
  type PersonaBotActivityState,
} from './avatar.js';
import { BotIcon, botBackdropUri } from './bot-icon.js';
import { sectionSortMode, type BotModePrefsSnapshot } from './bot-mode-prefs.js';
import { GroupChannelIcon } from './group-avatar-stack.js';
import { InboxIcon } from './inbox-icon.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import {
  steppedConversationId,
  webChannelShortcutIndex,
  webChannelShortcutLabel,
  webModalOpen,
  webQuickSwitcherBlocked,
  webShortcutBlocked,
} from './channel-shortcuts.js';
import { QuickSwitcher } from './quick-switcher.js';
import { ShortcutBindings } from './shortcut-bindings.js';
import { quickSwitcherEntries, type QuickSwitcherEntry } from './quick-switcher-rank.js';
import {
  reconcileChannelSelection,
  selectChannels,
  type ChannelSelection,
  type ChannelSelectionGesture,
} from './channel-selection.js';
import {
  HiddenChannelsModal,
  hiddenChannelSequence,
  type HiddenChannelItem,
} from './hidden-channels.js';
import {
  useChannelDrag,
  useSectionDrag,
  type ChannelDragProps,
  type ChannelDropTarget,
  type ScopeId,
  type SectionDropTarget,
} from './channel-drag.js';
import { needsYou, toBotState, ungroupedLabel } from './labels.js';
import type { BotHarnessTranslate } from './locale.js';
import { toolApprovalText } from './approval-text.js';
import { personaBotActivity } from './persona-activity.js';
import { CreatePersonaBotModal } from './persona-bot-create.js';
import { BotZipShareDialog, ImportBotZipModal } from './bot-zip.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { PersonaBotDeletionView } from './personabot-deletion.js';
import { NicknameDialog } from './human-channel-name.js';
import {
  CHANNEL_NICKNAME_ITEM,
  CHANNEL_SETTINGS_ITEM,
  channelNicknameItem,
  channelSettingsItem,
  dmActionKindOf,
  dmActionsItem,
  useHiddenDmActions,
} from './channel-options.js';
import { channelSettings, isChannelSettingsSection } from './channel-settings-state.js';
import type { ChannelSidebarRegistry } from './channel-sidebar.js';
import { toggleHiddenDmAction, type DmActionKind } from './dm-actions.js';
import { GitUnavailableNotice, gitReady } from './git-unavailable-notice.js';
import { MarketplaceModal } from './marketplace.js';
import {
  defaultStorage,
  saveRosterConfig,
  toggleSectionCollapsed,
  type RosterConfig,
} from './roster-config.js';
import type { RosterSection } from './roster.js';
import {
  applyChannelMove,
  completeFlatEntries,
  flatRosterChannelIds,
  moveWithinOrder,
  orderScopeChannels,
  planChannelMove,
  planFlatInsert,
  orderFlatEntries,
  resolvePinnedChannelIds,
  resolvedSortMode,
  resolveBlockDropTarget,
  rowDropHalf,
  type ChannelMoveSink,
  type FlatAnchor,
  type ScopeDropTarget,
} from './roster-order.js';
import {
  ChannelRenameModal,
  channelMoveMenuItems,
  CreateChannelModal,
  CreateSectionModal,
  globalSortMenuItems,
  pinnedSortMenuItems,
  SectionDeleteModal,
  SectionRenameModal,
  NEW_SECTION_MOVE_TARGET,
  sectionMenuItems,
  UNGROUPED_MOVE_TARGET,
} from './section-management.js';
import { store, type BotSummary, type ChannelSummary, type ClientState } from './store.js';
import {
  errorMessage,
  type ModelCatalogView,
  type ModelPlanStateView,
  type ModelRouteView,
} from './bridge.js';
import { rememberModelPlan } from './model-plan-store.js';
import { applyBotModelRoute, botModelMenuGroups, type BotModelGroup } from './bot-model-route.js';
import { useMountedResource } from './mounted-resource.js';
import { onCreationRequest } from './create-request.js';

export function useClientState(): ClientState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export interface BotPanelEntryProps {
  size: number;
  active: boolean;
  useBotModePrefs: SnapshotSelectorHook<BotModePrefsSnapshot>;
  openSettings: () => void;
  t: BotHarnessTranslate;
}

export function BotPanelIcon({
  size,
  active,
  onExit,
  useBotModePrefs,
  openSettings,
  openActivityCenter,
  refreshStatus,
  tutorial,
  t,
}: BotPanelEntryProps & {
  onExit: () => void;
  openActivityCenter: () => void;
  refreshStatus: () => Promise<void>;
  tutorial?: BotPanelTutorial | undefined;
}): ReactElement {
  const icon = useBotModePrefs((prefs) => prefs.botIcon);
  const [row, setRow] = useState<HTMLElement | null>(null);
  const wide = size === 16;
  const state = useClientState();
  const entryHidden = !active && (!wide || state.humanInbox.unreadCount === 0);
  const panelList = row?.parentElement;
  const entryLabel = [
    t('activityCenter.title'),
    ...(state.humanInbox.unreadCount > 0
      ? [
          t('humanInbox.unreadCount', {
            count: String(state.humanInbox.unreadCount),
          }),
        ]
      : []),
    ...(state.humanInbox.hasAction ? [t('humanInbox.action')] : []),
  ].join(' · ');
  const entryMount = useMountedResource<HTMLElement>(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 10_000);
    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  const glyphMount = useMountedResource<HTMLSpanElement>(
    (glyph) => {
      const button = glyph.closest('button');
      setRow(button);
      button?.style.setProperty('--bh-bot-texture', `url("${botBackdropUri(icon)}")`);
      if (button === null) return;
      button.setAttribute('data-bh-tour', 'bot-mode');
      const priorGridRow = button.style.gridRow;
      const siblings = Array.from(button.parentElement?.children ?? []).filter(
        (node) => !node.classList.contains('bh-human-inbox-entry'),
      );
      button.style.gridRow = String(siblings.indexOf(button) + 1);
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (
          (event.target as Element | null)?.closest(
            '.bh-panel-gear, .bh-panel-activity, .bh-onboarding-launcher',
          ) !== null
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        onExit();
      };
      const onClick = (event: MouseEvent): void => {
        if (
          (event.target as Element | null)?.closest(
            '.bh-panel-gear, .bh-panel-activity, .bh-onboarding-launcher',
          ) !== null
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        onExit();
      };
      if (active) {
        button.addEventListener('keydown', onKeyDown);
        button.addEventListener('click', onClick, true);
      }
      return () => {
        button.style.gridRow = priorGridRow;
        button.removeEventListener('keydown', onKeyDown);
        button.removeEventListener('click', onClick, true);
      };
    },
    [size, icon, active, onExit],
  );

  const openInbox = (event: SyntheticEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    openActivityCenter();
  };
  const inboxProps = {
    className: 'bh-root bh-human-inbox-entry bh-panel-activity',
    'data-bh-tour': 'inbox',
    'data-wide': wide ? 'true' : 'false',
    'data-unread': state.humanInbox.unreadCount > 0 ? 'true' : 'false',
    'data-active': active ? 'true' : 'false',
    tabIndex: entryHidden ? -1 : 0,
    'aria-hidden': entryHidden ? true : undefined,
    ref: entryMount,
    'aria-label': entryLabel,
    title: entryLabel,
    'aria-current': active && state.selection?.kind === 'inbox' ? ('page' as const) : undefined,
  };

  return (
    <span className="bh-panel-glyph" ref={glyphMount} {...(wide ? { 'data-wide': 'true' } : {})}>
      <BotIcon icon={icon} size={size} />
      {row !== null && !wide && panelList != null
        ? createPortal(
            <button
              type="button"
              {...inboxProps}
              style={{ gridRow: Number(row.style.gridRow) + 1 }}
              onClick={(event) => {
                event.stopPropagation();
                openActivityCenter();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
              }}
            >
              <InboxIcon size={18} />
              {active && (state.humanInbox.unreadCount > 0 || state.humanInbox.hasAction) ? (
                <span className="bh-human-inbox-notification-dot" aria-hidden="true" />
              ) : null}
            </button>,
            panelList,
          )
        : null}
      {row !== null && wide
        ? createPortal(
            <span className="bh-panel-actions">
              {tutorial !== undefined
                ? active
                  ? tutorial.launcher(t)
                  : tutorial.enterHint(t)
                : null}
              <span
                role="button"
                {...inboxProps}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={openInbox}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') openInbox(event);
                }}
              >
                <InboxIcon size={16} />
                {state.humanInbox.unreadCount > 0 ? (
                  <span className="bh-human-inbox-count">
                    {state.humanInbox.unreadCount > 99 ? '99+' : state.humanInbox.unreadCount}
                  </span>
                ) : null}
              </span>
              {active ? (
                <span
                  className="bh-panel-gear"
                  data-bh-tour="bot-settings"
                  role="button"
                  tabIndex={0}
                  aria-label={t('panel.settings')}
                  title={t('panel.settings')}
                  onClick={(event) => {
                    event.stopPropagation();
                    openSettings();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    openSettings();
                  }}
                >
                  <IconSettingsOutlineRegular size={14} />
                </span>
              ) : null}
            </span>,
            row,
          )
        : null}
    </span>
  );
}

export interface BotPanelTutorial {
  launcher(t: BotHarnessTranslate): ReactNode;
  enterHint(t: BotHarnessTranslate): ReactNode;
}

export function createBotPanelEntry(
  onExit: () => void,
  openActivityCenter: () => void,
  refreshStatus: () => Promise<void>,
  tutorial?: BotPanelTutorial,
): (props: BotPanelEntryProps) => ReactElement {
  return function BotPanelEntry({ size, active, useBotModePrefs, openSettings, t }) {
    return (
      <BotPanelIcon
        size={size}
        active={active}
        onExit={onExit}
        openActivityCenter={openActivityCenter}
        refreshStatus={refreshStatus}
        tutorial={tutorial}
        useBotModePrefs={useBotModePrefs}
        openSettings={openSettings}
        t={t}
      />
    );
  };
}

interface SidebarProps {
  headerEnd?: ReactNode;
  headerTarget?: HTMLElement | null;
  onViewProfile?: ((slug: string) => void) | undefined;
  companion?: WindowCompanions | undefined;
  wide: boolean;
  actions: BridgeActions;
  useBotModePrefs: SnapshotSelectorHook<BotModePrefsSnapshot>;
  setSortMode: (mode: BotModeSortMode) => void;
  setSectionSortMode: (sectionId: string, mode: BotModeSortMode | undefined) => void;
  channelSidebar?: ChannelSidebarRegistry | undefined;
  shortcutBindings?: ShortcutBindings | undefined;
  t: BotHarnessTranslate;
}

const fallbackShortcutBindings = new ShortcutBindings(undefined);

function hasChannelSettings(
  registry: ChannelSidebarRegistry | undefined,
  channel: ChannelSummary,
): boolean {
  if (registry === undefined) return false;
  const scope = channel.type === 'dm' && channel.botSlug !== undefined ? 'personabot' : 'channel';
  return registry.entries(scope).some(isChannelSettingsSection);
}

interface ChannelMenuRequest {
  channelId: string;
  channelIds?: readonly string[];
  pinnedView?: boolean;
  x: number;
  y: number;
}

interface SectionMenuRequest {
  sectionId: string;
  x: number;
  y: number;
}

interface PinDragState {
  channelId: string;
  source: 'roster' | 'pinned';
}

function matchesQuery(query: string, ...values: (string | undefined)[]): boolean {
  if (query.length === 0) return true;
  return values.some((value) => (value ?? '').toLowerCase().includes(query));
}

function RoleBadges({ roles }: { roles: readonly string[] }): ReactElement | null {
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

function ChannelMessageTime({ channel }: { channel: ChannelSummary }): ReactElement | null {
  const at = channel.latestMessage?.at;
  if (at === undefined) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <time className="bh-channel-message-time" dateTime={at} title={date.toLocaleString()}>
      {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </time>
  );
}

export function unreadCountLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

function UnreadCount({
  count,
  muted = false,
  t,
}: {
  count: number;
  muted?: boolean;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (count <= 0) return null;
  return (
    <span
      className={`bh-unread-count${muted ? ' bh-unread-count-muted' : ''}`}
      aria-label={t('roster.unreadCount', { count })}
    >
      {unreadCountLabel(count)}
    </span>
  );
}

function MutedMark({ t }: { t: BotHarnessTranslate }): ReactElement {
  return (
    <span className="bh-muted-mark" role="img" aria-label={t('roster.muted')}>
      <ChannelSidebarIcon name="bell-off" size={12} />
    </span>
  );
}

function channelPreview(
  channel: ChannelSummary,
  bots: ReadonlyMap<string, BotSummary>,
  t: BotHarnessTranslate,
): string {
  const message = channel.latestMessage;
  if (message?.contentPurged) return t('purge.purged');
  if (message === undefined) return t('rail.noMessages');
  if (message.turnStop !== undefined)
    return t('turn.stopped', {
      human: message.turnStop.humanName,
      name: message.turnStop.botName,
    });
  if (message.memberDeparture !== undefined)
    return t(
      message.memberDeparture.departureType === 'removed' ? 'member.removed' : 'member.left',
      { name: message.memberDeparture.displayName },
    );
  const body =
    toolApprovalText(message, t) ??
    (attachmentReferenceLabels(message.body, message.attachments ?? [])
      .replace(/\s+/gu, ' ')
      .trim() ||
      message.attachments?.[0]?.name ||
      t('roster.latestActivity'));
  const author =
    message.author.kind === 'human'
      ? t('rail.you')
      : message.author.kind === 'bot'
        ? (bots.get(message.author.slug)?.displayName ?? message.author.slug)
        : message.author.kind === 'bridged'
          ? message.author.source
          : undefined;
  return author === undefined ? body : `${author}：${body}`;
}

function BotRow({
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
  t,
}: {
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
  drag: ChannelDragProps;
  onMenu: (request: ChannelMenuRequest) => void;
  onPinDragStart: (channelId: string) => void;
  onPinDragEnd: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const botState = toBotState(bot.aggregateState);
  const markerClass =
    drag.marker === 'before' ? ' bh-drop-before' : drag.marker === 'after' ? ' bh-drop-after' : '';
  const sourceClass = drag.source ? ' bh-drag-source' : '';
  return (
    <Tooltip
      label={`${bot.displayName} · ${personaBotPresentationSummary(activity, bot.activity, bot.attention, t)}`}
      side="right"
      delayMs={350}
    >
      <button
        type="button"
        data-channel-id={channel.id}
        className={`bh-contact${unread > 0 ? ' bh-has-unread' : ''}${muted ? ' bh-muted' : ''}${selected ? ' bh-selected' : ''}${multiSelected ? ' bh-multi-selected' : ''}${showShortcutHints && shortcut !== undefined ? ' bh-shortcut-active' : ''}${markerClass}${sourceClass}`}
        aria-pressed={multiSelected}
        aria-keyshortcuts={shortcut}
        title={shortcut === undefined ? undefined : t('shortcut.web.open', { key: shortcut })}
        onClick={onActivate}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', channel.id);
          drag.start();
          onPinDragStart(channel.id);
        }}
        onDragEnd={() => {
          drag.end();
          onPinDragEnd();
        }}
        onDragOver={(event) => {
          if (!drag.active) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          drag.hover(rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()));
        }}
        onDrop={(event) => {
          if (!drag.active) return;
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
      >
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
          size={34}
          indicator={false}
        />
        <span className="bh-body">
          <span className="bh-top">
            <span className="bh-name">{bot.displayName}</span>
            {muted ? <MutedMark t={t} /> : null}
            {needsYou(botState) ? (
              <span className="bh-unread" title={t('roster.needsYou')} />
            ) : null}
            <PersonaBotStatusBadges state={activity} attention={bot?.attention} />
            <ChannelMessageTime channel={channel} />
          </span>
          <span className="bh-bottom">
            <span className="bh-msg">{preview}</span>
            <UnreadCount count={unread} muted={muted} t={t} />
          </span>
        </span>
        {showShortcutHints && shortcut !== undefined ? (
          <kbd className="bh-shortcut-badge" aria-hidden="true">
            {shortcut.slice(4)}
          </kbd>
        ) : null}
      </button>
    </Tooltip>
  );
}
function ChannelRow({
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
  t,
}: {
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
  t: BotHarnessTranslate;
}): ReactElement {
  const marker = drag?.marker ?? null;
  const markerClass =
    marker === 'before' ? ' bh-drop-before' : marker === 'after' ? ' bh-drop-after' : '';
  const sourceClass = drag?.source === true ? ' bh-drag-source' : '';
  return (
    <button
      type="button"
      data-channel-id={channel.id}
      className={`bh-channel-row${unread > 0 ? ' bh-has-unread' : ''}${muted ? ' bh-muted' : ''}${selected ? ' bh-selected' : ''}${multiSelected ? ' bh-multi-selected' : ''}${showShortcutHints && shortcut !== undefined ? ' bh-shortcut-active' : ''}${markerClass}${sourceClass}`}
      aria-pressed={multiSelected}
      aria-keyshortcuts={shortcut}
      title={shortcut === undefined ? undefined : t('shortcut.web.open', { key: shortcut })}
      onClick={onActivate}
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
    >
      <GroupChannelIcon
        channel={channel}
        bots={bots}
        className="bh-channel-slot"
        groupClassName="bh-group-channel-slot"
        size={34}
        hashSize={18}
        t={t}
      />
      <span className="bh-body">
        <span className="bh-top">
          <span className="bh-name">{channel.name}</span>
          {muted ? <MutedMark t={t} /> : null}
          <ChannelMessageTime channel={channel} />
        </span>
        <span className="bh-bottom">
          <span className="bh-msg">{preview}</span>
          <UnreadCount count={unread} muted={muted} t={t} />
        </span>
      </span>
      {showShortcutHints && shortcut !== undefined ? (
        <kbd className="bh-shortcut-badge" aria-hidden="true">
          {shortcut.slice(4)}
        </kbd>
      ) : null}
    </button>
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
        <button
          type="button"
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
            <GroupChannelIcon
              channel={channel}
              bots={bots}
              className="bh-rail-channel-icon"
              groupClassName="bh-group-channel-icon"
              size={32}
              hashSize={18}
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
              size={32}
            />
          )}
          <UnreadCount count={unread} muted={muted} t={t} />
          {showShortcutHints && shortcut !== undefined ? (
            <kbd className="bh-shortcut-badge" aria-hidden="true">
              {shortcut.slice(4)}
            </kbd>
          ) : null}
        </button>
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

type CreateRequest =
  | { kind: 'bot'; source: 'empty' | 'git' | 'zip'; sectionId?: string }
  | {
      kind: 'section';
      moveChannelId?: string;
      moveChannelIds?: readonly string[];
      pinned?: boolean;
    }
  | { kind: 'channel'; sectionId?: string }
  | { kind: 'marketplace' };

type FlatBlockView =
  | { kind: 'section'; section: RosterSection; channels: ChannelSummary[] }
  | { kind: 'loose'; channels: ChannelSummary[] };

export function BotSidebar({
  headerEnd,
  headerTarget,
  onViewProfile,
  companion,
  wide,
  actions,
  useBotModePrefs,
  setSortMode,
  setSectionSortMode,
  channelSidebar,
  shortcutBindings = fallbackShortcutBindings,
  t,
}: SidebarProps): ReactElement {
  const state = useClientState();
  const channelUnread = state.humanInbox.channelUnread;
  const mutedChannelSet = new Set(state.roster.muted);
  const prefs = useBotModePrefs((value) => value);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [pinSortMenuOpen, setPinSortMenuOpen] = useState(false);
  const [hiddenManagerOpen, setHiddenManagerOpen] = useState(false);
  const [channelHistoryOpen, setChannelHistoryOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [sectionMenuId, setSectionMenuId] = useState<string | undefined>(undefined);
  const [sectionCreateMenuId, setSectionCreateMenuId] = useState<string | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [channelMenu, setChannelMenu] = useState<ChannelMenuRequest | undefined>(undefined);
  const [sharing, setSharing] = useState<BotSummary | undefined>(undefined);
  const [undoToast, setUndoToast] = useState<
    { seq: number; text: string; undo: () => Promise<unknown> } | undefined
  >(undefined);
  const undoSeq = useRef(0);
  const offerUndo = (text: string, undo: () => Promise<unknown>): void => {
    undoSeq.current += 1;
    setUndoToast({ seq: undoSeq.current, text, undo });
  };
  const conversationName = (channelId: string): string => {
    const snapshot = store.getSnapshot();
    const channel = snapshot.channels.find((candidate) => candidate.id === channelId);
    const bot =
      channel?.botSlug === undefined
        ? undefined
        : snapshot.bots.find((candidate) => candidate.slug === channel.botSlug);
    return bot?.displayName ?? channel?.name ?? channelId;
  };
  const sectionName = (sectionId: string | undefined): string =>
    sectionId === undefined
      ? ungroupedLabel(t)
      : (store.getSnapshot().roster.sections.find((section) => section.id === sectionId)?.name ??
        ungroupedLabel(t));
  const unhideChannels = async (ids: readonly string[]): Promise<void> => {
    for (const id of ids) await actions.setChannelHidden(id, false);
  };
  const [deleting, setDeleting] = useState<BotSummary | undefined>(undefined);
  const [nicknameTarget, setNicknameTarget] = useState<ChannelSummary | undefined>(undefined);
  const menuBotSlug = state.channels.find(
    (candidate) => candidate.id === channelMenu?.channelId && candidate.type === 'dm',
  )?.botSlug;
  const [menuModelOptions, setMenuModelOptions] = useState<{
    slug: string;
    catalog: ModelCatalogView;
    state: ModelPlanStateView;
  }>();
  const menuModelData = menuModelOptions?.slug === menuBotSlug ? menuModelOptions : undefined;
  const [menuModelBusy, setMenuModelBusy] = useState(false);
  const [menuModelError, setMenuModelError] = useState<string | undefined>(undefined);
  const menuModelMount = useMountedResource<HTMLSpanElement>(() => {
    setMenuModelOptions(undefined);
    if (menuBotSlug === undefined) return;
    let active = true;
    void Promise.all([actions.modelCatalog(), actions.modelPlanState(menuBotSlug)]).then(
      ([catalog, planState]) => {
        if (!active) return;
        rememberModelPlan(menuBotSlug, planState.plan);
        setMenuModelOptions({ slug: menuBotSlug, catalog, state: planState });
      },
      (failure: unknown) => {
        if (active) setMenuModelError(`${t('modelPreset.loadFailed')}: ${errorMessage(failure)}`);
      },
    );
    return () => {
      active = false;
    };
  }, [actions, menuBotSlug]);
  const applyMenuModel = (route: ModelRouteView): void => {
    if (menuBotSlug === undefined || menuModelData === undefined || menuModelBusy) return;
    setMenuModelBusy(true);
    void applyBotModelRoute(actions, menuBotSlug, menuModelData.state, route)
      .then((plan) => {
        setMenuModelOptions((current) =>
          current?.slug === menuBotSlug
            ? { ...current, state: { revision: plan.revision, plan } }
            : current,
        );
      })
      .catch((failure: unknown) => {
        setMenuModelError(t('modelPreset.changeFailed', { error: errorMessage(failure) }));
      })
      .finally(() => {
        setMenuModelBusy(false);
        setChannelMenu((current) => (current === channelMenu ? undefined : current));
      });
  };
  const menuHiddenDmActions = useHiddenDmActions(
    channelMenu === undefined
      ? undefined
      : state.channels.find(
          (candidate) => candidate.id === channelMenu.channelId && candidate.type === 'dm',
        )?.botSlug,
  );
  const openChannelSettings = async (channel: ChannelSummary): Promise<void> => {
    if (store.getSnapshot().conversation.channel?.id !== channel.id)
      await (channel.botSlug === undefined
        ? actions.openChannel(channel.id)
        : actions.openBot(channel.botSlug));
    channelSettings.open(channelSettings.attentionOf(channel.id)[0]);
  };
  const [channelSelection, setChannelSelection] = useState<ChannelSelection>({
    ids: [],
    anchorId: undefined,
  });
  const [batchBusy, setBatchBusy] = useState(false);
  const [showShortcutHints, setShowShortcutHints] = useState(false);
  const [batchError, setBatchError] = useState<'failed' | 'limit' | 'reorder' | undefined>();
  const [pinDrag, setPinDrag] = useState<PinDragState | undefined>(undefined);
  const [pinReorderTarget, setPinReorderTarget] = useState<
    { channelId: string; half: 'before' | 'after' } | undefined
  >(undefined);

  const [pinZoneArmed, setPinZoneArmed] = useState(false);
  const [sectionContextMenu, setSectionContextMenu] = useState<SectionMenuRequest | undefined>();
  const [channelRenameTarget, setChannelRenameTarget] = useState<ChannelSummary | undefined>();
  const [pinZoneHovered, setPinZoneHovered] = useState(false);
  const [unpinZoneArmed, setUnpinZoneArmed] = useState(false);
  const [unpinZoneHovered, setUnpinZoneHovered] = useState(false);
  const [createRequest, setCreateRequest] = useState<CreateRequest | undefined>(undefined);
  const createFromWelcome = useMountedResource<HTMLSpanElement>(
    () =>
      onCreationRequest((intent) =>
        setCreateRequest(intent === 'bot' ? { kind: 'bot', source: 'empty' } : { kind: 'channel' }),
      ),
    [],
  );
  const [renameTarget, setRenameTarget] = useState<RosterSection | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<RosterSection | undefined>(undefined);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const pinZoneArmTimer = useRef<number | undefined>(undefined);
  const searchQueryRef = useRef(state.query);
  searchQueryRef.current = state.query;
  const searchMount = useMountedResource<HTMLDivElement>(
    (node) => {
      if (!searchOpen) return;
      node.querySelector<HTMLInputElement>('.bh-search-input')?.focus({ preventScroll: true });
      const onClick = (event: MouseEvent): void => {
        if (!(event.target instanceof Node) || node.contains(event.target)) return;
        searchInput.current?.blur();
        if (searchQueryRef.current.trim() !== '') return;
        setSearchOpen(false);
      };
      document.addEventListener('click', onClick);
      return () => document.removeEventListener('click', onClick);
    },
    [searchOpen],
  );

  const query = state.query.trim().toLowerCase();
  const botBySlug = new Map(state.bots.map((bot) => [bot.slug, bot]));
  const hiddenChannelSet = new Set(state.roster.hidden);
  const allPinnedChannelIds = resolvePinnedChannelIds(state.channels, state.roster.pins);
  const allPinnedChannelSet = new Set(allPinnedChannelIds);
  const pinnedById = new Map(state.channels.map((channel) => [channel.id, channel]));
  const orderedPinnedIds = orderScopeChannels(
    allPinnedChannelIds.flatMap((id) => pinnedById.get(id) ?? []),
    resolvedSortMode(prefs.sortModes[PINNED_SORT_SCOPE_ID], prefs.sortMode),
    allPinnedChannelIds,
  ).map((channel) => channel.id);
  const pinnedChannelIds = orderedPinnedIds.filter((id) => !hiddenChannelSet.has(id));
  const hasPinnedChannels = pinnedChannelIds.length > 0;
  const hasPinnableChannels = state.channels.some(
    (channel) =>
      !hiddenChannelSet.has(channel.id) &&
      (channel.type === 'group' || channel.botSlug !== undefined),
  );
  const pinnedChannels = pinnedChannelIds.flatMap((channelId) => {
    const channel = state.channels.find((candidate) => candidate.id === channelId);
    if (channel === undefined) return [];
    if (channel.type === 'group') {
      return matchesQuery(query, channel.name) ? [channel] : [];
    }
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    return bot !== undefined && matchesQuery(query, bot.displayName, ...bot.roles) ? [channel] : [];
  });
  const arrangedChannels = state.channels.filter(
    (channel) =>
      !allPinnedChannelSet.has(channel.id) &&
      (channel.type === 'group' || channel.botSlug !== undefined),
  );
  const rosterChannels = arrangedChannels.filter((channel) => !hiddenChannelSet.has(channel.id));
  const channels = rosterChannels.filter((channel) => {
    if (channel.type === 'group') return matchesQuery(query, channel.name);
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    return bot !== undefined && matchesQuery(query, bot.displayName, ...bot.roles);
  });
  const sectionedIds = new Set(state.roster.sections.flatMap((section) => section.channelIds));
  const rosterChannelIds = flatRosterChannelIds(state.channels, allPinnedChannelSet);
  const flatEntries = orderFlatEntries(
    completeFlatEntries(
      state.roster.topOrder,
      state.roster.sections.map((section) => section.id),
      rosterChannelIds,
      sectionedIds,
    ),
    new Map(state.channels.map((channel) => [channel.id, channel])),
    prefs.sortMode,
  );
  const sectionOrder = (
    section: RosterSection,
    source: readonly ChannelSummary[],
  ): ChannelSummary[] => {
    const visible = source.filter((channel) => section.channelIds.includes(channel.id));
    const mode = resolvedSortMode(prefs.sortModes[section.id], prefs.sortMode);
    return orderScopeChannels(visible, mode, section.channelIds);
  };
  const scopeChannelsOf = (scopeId: ScopeId): ChannelSummary[] => {
    if (scopeId === undefined) {
      const snapshot = store.getSnapshot();
      const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
      return orderScopeChannels(
        arrangedChannels.filter((channel) => !sectioned.has(channel.id)),
        prefs.sortMode,
      );
    }
    const section = store
      .getSnapshot()
      .roster.sections.find((candidate) => candidate.id === scopeId);
    return section === undefined ? [] : sectionOrder(section, arrangedChannels);
  };
  const sectionOfChannel = (channelId: string): string | undefined =>
    store.getSnapshot().roster.sections.find((section) => section.channelIds.includes(channelId))
      ?.id;
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const flatBlocks: FlatBlockView[] = (() => {
    const blocks: FlatBlockView[] = [];
    let run: ChannelSummary[] = [];
    const flushRun = (): void => {
      if (run.length > 0) {
        blocks.push({ kind: 'loose', channels: run });
        run = [];
      }
    };
    for (const entry of flatEntries) {
      if (entry.kind === 'section') {
        flushRun();
        const section = state.roster.sections.find((candidate) => candidate.id === entry.id);
        if (section === undefined) continue;
        const visible = sectionOrder(section, channels);
        if (query.length > 0 && visible.length === 0) continue;
        blocks.push({ kind: 'section', section, channels: visible });
      } else {
        const channel = channelById.get(entry.id);
        if (channel === undefined) continue;
        run.push(channel);
      }
    }
    flushRun();
    if (query.length > 0) return blocks.filter((block) => block.channels.length > 0);
    return blocks;
  })();
  const visibleChannelIds = [
    ...pinnedChannels.map((channel) => channel.id),
    ...flatBlocks.flatMap((block) =>
      block.kind === 'section' && state.config.collapsed[block.section.id] === true
        ? []
        : block.channels.map((channel) => channel.id),
    ),
  ];
  const visibleIdsKey = visibleChannelIds.join('|');
  const [previousVisibleIdsKey, setPreviousVisibleIdsKey] = useState(visibleIdsKey);
  if (previousVisibleIdsKey !== visibleIdsKey) {
    setPreviousVisibleIdsKey(visibleIdsKey);
    const next = reconcileChannelSelection(channelSelection, visibleChannelIds);
    if (
      next.ids.length !== channelSelection.ids.length ||
      next.ids.some((id, index) => id !== channelSelection.ids[index]) ||
      next.anchorId !== channelSelection.anchorId
    ) {
      setChannelSelection(next);
    }
  }
  const selectedChannelIds = reconcileChannelSelection(channelSelection, visibleChannelIds).ids;
  const selectedChannelSet = new Set(selectedChannelIds);
  const selectedChannels = visibleChannelIds
    .filter((id) => selectedChannelSet.has(id))
    .flatMap((id) => state.channels.find((channel) => channel.id === id) ?? []);
  const selectedBotCount = selectedChannels.filter(
    (channel) => channel.botSlug !== undefined,
  ).length;
  const selectedItems = t(
    selectedBotCount === selectedChannels.length ? 'bulk.bots' : 'bulk.channels',
    { count: selectedChannels.length },
  );
  const railPinnedChannels = pinnedChannelIds.flatMap((channelId) => {
    const channel = state.channels.find((candidate) => candidate.id === channelId);
    return channel === undefined ? [] : [channel];
  });
  const railChannels = flatEntries.flatMap((entry) => {
    if (entry.kind === 'channel') {
      const channel = rosterChannels.find((candidate) => candidate.id === entry.id);
      return channel === undefined ? [] : [channel];
    }
    const section = state.roster.sections.find((candidate) => candidate.id === entry.id);
    return section === undefined ? [] : sectionOrder(section, rosterChannels);
  });
  const shortcutIds = wide
    ? visibleChannelIds
    : [...railPinnedChannels, ...railChannels].map((channel) => channel.id);
  const shortcutIdsRef = useRef<readonly string[]>(shortcutIds);
  shortcutIdsRef.current = shortcutIds;
  const navigationIdsRef = useRef<readonly string[]>([]);
  navigationIdsRef.current = [...railPinnedChannels, ...railChannels].map((channel) => channel.id);
  const dragActiveRef = useRef(false);
  const rosterMount = useMountedResource<HTMLDivElement>(() => {
    const acceptDrag = (event: DragEvent): void => {
      if (!dragActiveRef.current) return;
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
    };
    const acceptDrop = (event: DragEvent): void => {
      if (dragActiveRef.current) event.preventDefault();
    };
    const onHintDown = (event: KeyboardEvent): void => {
      if (event.altKey && !event.getModifierState('AltGraph')) setShowShortcutHints(true);
    };
    const onHintUp = (event: KeyboardEvent): void => {
      if (!event.altKey || event.getModifierState('AltGraph')) setShowShortcutHints(false);
    };
    const clearHints = (): void => setShowShortcutHints(false);
    const onVisibilityChange = (): void => {
      if (document.hidden) clearHints();
    };
    const onSelectionEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (webShortcutBlocked(event.target, document)) return;
      if (document.querySelector('[role="menu"]') !== null) return;
      setChannelSelection((current) =>
        current.ids.length === 0 ? current : { ids: [], anchorId: undefined },
      );
    };
    const onChannelShortcut = (event: KeyboardEvent): void => {
      const index = webChannelShortcutIndex(event.code, {
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey,
        altGraph: event.getModifierState('AltGraph'),
        composing: event.isComposing,
        repeat: event.repeat,
        prevented: event.defaultPrevented,
      });
      if (index === undefined) return;
      if (webShortcutBlocked(event.target, document)) return;
      const id = shortcutIdsRef.current[index];
      if (id === undefined) return;
      const channel = store.getSnapshot().channels.find((candidate) => candidate.id === id);
      if (channel === undefined) return;
      event.preventDefault();
      void (channel.botSlug === undefined
        ? actions.openChannel(id)
        : actions.openBot(channel.botSlug));
    };
    const onConversationStep = (event: KeyboardEvent): void => {
      const action = (
        ['conversation-prev', 'conversation-next', 'unread-prev', 'unread-next'] as const
      ).find((candidate) => shortcutBindings.matches(candidate, event));
      const step =
        action === undefined
          ? undefined
          : {
              direction: action.endsWith('-prev') ? (-1 as const) : (1 as const),
              unreadOnly: action.startsWith('unread-'),
            };
      if (step === undefined || webModalOpen(document)) return;
      if (document.querySelector('[role="menu"]') !== null) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[aria-expanded="true"]') !== null
      )
        return;
      const snapshot = store.getSnapshot();
      const selection = snapshot.selection;
      const currentId =
        selection?.kind === 'channel'
          ? selection.channelId
          : selection?.kind === 'bot'
            ? snapshot.channels.find(
                (channel) => channel.type === 'dm' && channel.botSlug === selection.slug,
              )?.id
            : undefined;
      const unread = snapshot.humanInbox.channelUnread;
      const id = steppedConversationId(
        navigationIdsRef.current,
        currentId,
        step.direction,
        step.unreadOnly
          ? (candidate) =>
              (unread[candidate] ?? 0) > 0 && !snapshot.roster.muted.includes(candidate)
          : undefined,
      );
      const channel = snapshot.channels.find((candidate) => candidate.id === id);
      if (channel === undefined) return;
      event.preventDefault();
      void (channel.botSlug === undefined
        ? actions.openChannel(channel.id)
        : actions.openBot(channel.botSlug));
    };
    document.addEventListener('keydown', onHintDown);
    document.addEventListener('keyup', onHintUp);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', clearHints);
    document.addEventListener('keydown', onSelectionEscape);
    const onQuickSwitcher = (event: KeyboardEvent): void => {
      if (!shortcutBindings.matches('quick-switcher', event)) {
        return;
      }
      if (webQuickSwitcherBlocked(event.target, document)) return;
      event.preventDefault();
      setShowShortcutHints(false);
      setQuickSwitcherOpen(true);
    };
    document.addEventListener('keydown', onChannelShortcut);
    document.addEventListener('keydown', onConversationStep);
    document.addEventListener('keydown', onQuickSwitcher);
    document.addEventListener('dragover', acceptDrag);
    document.addEventListener('drop', acceptDrop);
    return () => {
      document.removeEventListener('keydown', onHintDown);
      document.removeEventListener('keyup', onHintUp);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', clearHints);
      document.removeEventListener('keydown', onSelectionEscape);
      document.removeEventListener('keydown', onChannelShortcut);
      document.removeEventListener('keydown', onConversationStep);
      document.removeEventListener('keydown', onQuickSwitcher);
      document.removeEventListener('dragover', acceptDrag);
      document.removeEventListener('drop', acceptDrop);
      if (pinZoneArmTimer.current !== undefined) window.clearTimeout(pinZoneArmTimer.current);
    };
  }, [actions, shortcutBindings]);
  const shortcutFor = (channelId: string): string | undefined =>
    webChannelShortcutLabel(shortcutIds.indexOf(channelId));
  const hiddenItems: HiddenChannelItem[] = hiddenChannelSequence(
    state.channels,
    state.roster.hidden,
  ).map((channel) => {
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    return {
      channel,
      ...(bot === undefined ? {} : { bot, activity: personaBotActivity(state, bot) }),
    };
  });
  const visibleCount =
    pinnedChannels.length + flatBlocks.reduce((total, block) => total + block.channels.length, 0);
  const selectedBot = state.selection?.kind === 'bot' ? state.selection.slug : undefined;
  const selectedChannel =
    state.selection?.kind === 'channel' ? state.selection.channelId : undefined;
  const contextSection = state.roster.sections.find(
    (section) => section.id === sectionContextMenu?.sectionId,
  );
  const contextSectionIndex =
    contextSection === undefined ? -1 : state.roster.sections.indexOf(contextSection);

  const persistConfig = (next: RosterConfig): void => {
    store.setConfig(next);
    saveRosterConfig(next, defaultStorage());
  };

  const selectMenu = (id: string): void => {
    setMenuOpen(false);
    const source = botCreateSource(id);
    if (source !== undefined) setCreateRequest({ kind: 'bot', source });
    if (id === 'channel') setCreateRequest({ kind: 'channel' });
    if (id === 'section') setCreateRequest({ kind: 'section' });
    if (id === 'marketplace') setCreateRequest({ kind: 'marketplace' });
  };

  const selectSortMenu = (id: string): void => {
    setSortMenuOpen(false);
    if (id === 'channel-history') {
      setChannelHistoryOpen(true);
      return;
    }
    if (id === 'hidden') {
      setHiddenManagerOpen(true);
      return;
    }
    if (id === 'mark-all-read') {
      void actions.markAllRead().catch((error: unknown) => {
        console.warn('botharness: mark all read failed', error);
      });
      return;
    }
    if (isBotModeSortMode(id)) setSortMode(id);
  };

  const selectPinnedSortMenu = (id: string): void => {
    setPinSortMenuOpen(false);
    if (id === 'inherit') {
      setSectionSortMode(PINNED_SORT_SCOPE_ID, undefined);
      return;
    }
    if (isBotModeSortMode(id)) setSectionSortMode(PINNED_SORT_SCOPE_ID, id);
  };

  const selectSectionMenu = (section: RosterSection, id: string): void => {
    setSectionMenuId(undefined);
    setSectionContextMenu(undefined);
    if (id === 'inherit') {
      setSectionSortMode(section.id, undefined);
      return;
    }
    if (isBotModeSortMode(id)) {
      setSectionSortMode(section.id, id);
      return;
    }
    if (id === 'move-up' || id === 'move-down') {
      const sections = store.getSnapshot().roster.sections;
      const index = sections.findIndex((candidate) => candidate.id === section.id);
      const target = sections[index + (id === 'move-up' ? -1 : 1)];
      if (target === undefined) return;
      const order = moveWithinOrder(
        sections.map((candidate) => candidate.id),
        section.id,
        target.id,
        id === 'move-up' ? 'before' : 'after',
      );
      if (order !== undefined) void actions.reorderSections(order);
      return;
    }
    if (id === 'rename') {
      setRenameTarget(section);
      return;
    }
    if (id === 'delete') {
      setDeleteTarget(section);
    }
  };

  const toggleSection = (sectionId: string): void => {
    persistConfig(toggleSectionCollapsed(store.getSnapshot().config, sectionId));
  };

  const moveSink: ChannelMoveSink = {
    assignToUngrouped: (channelId) => {
      void actions.assignChannel(channelId, undefined);
    },
    moveToSection: (channelId, sectionId, order) => {
      void actions.moveChannel(channelId, sectionId, order);
    },
    setSectionManual: (sectionId) => {
      setSectionSortMode(sectionId, 'manual');
    },
  };

  const runChannelMove = (
    channelId: string,
    sourceScopeId: ScopeId,
    targetScopeId: ScopeId,
    target: ScopeDropTarget,
  ): void => {
    const plan = planChannelMove(sourceScopeId, channelId, {
      targetScopeId,
      target,
      targetOrder: scopeChannelsOf(targetScopeId).map((channel) => channel.id),
      targetManualOverride:
        targetScopeId !== undefined && prefs.sortModes[targetScopeId] === 'manual',
    });
    const movingPinned = pinDrag?.source === 'pinned' && pinDrag.channelId === channelId;
    if (plan === undefined) {
      if (movingPinned && targetScopeId !== undefined && sourceScopeId === targetScopeId) {
        void actions.setChannelPinned(channelId, false);
        endPinDrag();
      }
      return;
    }
    if (movingPinned) {
      if (plan.kind === 'section') {
        if (plan.setManualOverride) setSectionSortMode(plan.sectionId, 'manual');
        void actions.movePinnedChannel(channelId, plan.sectionId, plan.order);
      } else {
        void actions.setChannelPinned(channelId, false);
      }
      endPinDrag();
      return;
    }
    applyChannelMove(moveSink, channelId, plan);
  };

  const commitChannelDrag = (
    drag: { scopeId: ScopeId; channelId: string },
    target: ChannelDropTarget,
  ): void => {
    if (target.channelId === drag.channelId) return;
    if (sectionOfChannel(target.channelId) === undefined) {
      runFlatInsert(drag.channelId, drag.scopeId, {
        kind: 'channel',
        id: target.channelId,
        side: target.half,
      });
      return;
    }
    runChannelMove(drag.channelId, drag.scopeId, target.scopeId, {
      kind: 'row',
      channelId: target.channelId,
      half: target.half,
    });
  };

  const commitChannelScopeDrop = (
    drag: { scopeId: ScopeId; channelId: string },
    scopeId: ScopeId,
  ): void => {
    runChannelMove(drag.channelId, drag.scopeId, scopeId, {
      kind: 'scope',
      position: 'first',
    });
  };

  const runFlatInsert = (channelId: string, sourceScopeId: ScopeId, anchor: FlatAnchor): void => {
    const snapshot = store.getSnapshot();
    const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
    const snapshotPinned = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
    const snapshotChannelIds = flatRosterChannelIds(snapshot.channels, new Set(snapshotPinned));
    const flat = completeFlatEntries(
      snapshot.roster.topOrder,
      snapshot.roster.sections.map((section) => section.id),
      snapshotChannelIds,
      sectioned,
    );
    const movingPinned = pinDrag?.source === 'pinned' && pinDrag.channelId === channelId;
    const plan = planFlatInsert(
      flat,
      channelId,
      movingPinned || sourceScopeId !== undefined,
      anchor,
    );
    if (plan === undefined) return;
    if (movingPinned) {
      void actions.movePinnedChannelToFlat(channelId, plan.order);
      endPinDrag();
      return;
    }
    if (plan.unassign) {
      void actions.moveToFlat(channelId, plan.order);
    } else {
      void actions.reorderFlat(plan.order);
    }
  };

  const commitChannelGapDrop = (
    drag: { scopeId: ScopeId; channelId: string },
    target: { sectionId: string; half: 'before' | 'after' },
  ): void => {
    runFlatInsert(drag.channelId, drag.scopeId, {
      kind: 'section',
      id: target.sectionId,
      side: target.half,
    });
  };

  const commitChannelMenuMove = (
    channelId: string,
    targetSectionId: string | undefined,
    pinned: boolean,
  ): void => {
    if (!pinned) {
      const sourceSectionId = sectionOfChannel(channelId);
      if (sourceSectionId === targetSectionId) return;
      runChannelMove(channelId, sourceSectionId, targetSectionId, {
        kind: 'scope',
      });
      offerUndo(
        t('undo.moved', {
          name: conversationName(channelId),
          section: sectionName(targetSectionId),
        }),
        async () => {
          runChannelMove(channelId, targetSectionId, sourceSectionId, {
            kind: 'scope',
          });
        },
      );
      return;
    }
    if (targetSectionId !== undefined) {
      const order = [
        ...scopeChannelsOf(targetSectionId)
          .map((channel) => channel.id)
          .filter((id) => id !== channelId),
        channelId,
      ];
      setSectionSortMode(targetSectionId, 'manual');
      void actions.movePinnedChannel(channelId, targetSectionId, order);
      return;
    }
    const snapshot = store.getSnapshot();
    const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
    const flat = completeFlatEntries(
      snapshot.roster.topOrder,
      snapshot.roster.sections.map((section) => section.id),
      flatRosterChannelIds(
        snapshot.channels,
        new Set(resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins)),
      ),
      sectioned,
    );
    void actions.movePinnedChannelToFlat(channelId, [...flat, { kind: 'channel', id: channelId }]);
  };

  const commitSectionDrag = (sectionId: string, target: SectionDropTarget): void => {
    const order = moveWithinOrder(
      store.getSnapshot().roster.sections.map((section) => section.id),
      sectionId,
      target.sectionId,
      target.half,
    );
    if (order === undefined) return;
    void actions.reorderSections(order);
  };

  const commitBulkChange = async (
    input: Parameters<BridgeActions['batchRoster']>[0],
  ): Promise<void> => {
    if (batchBusy) return;
    setChannelMenu(undefined);
    if (input.channelIds.length > 100) {
      setBatchError('limit');
      return;
    }
    setBatchBusy(true);
    setBatchError(undefined);
    const priorSections = new Map(
      input.channelIds.map((channelId) => [channelId, sectionOfChannel(channelId)] as const),
    );
    const previousSortMode =
      input.action === 'move' && input.sectionId !== undefined
        ? prefs.sortModes[input.sectionId]
        : undefined;
    if (input.action === 'move' && input.sectionId !== undefined) {
      setSectionSortMode(input.sectionId, 'manual');
    }
    const succeeded = await actions.batchRoster(input);
    setBatchBusy(false);
    if (!succeeded) {
      if (input.action === 'move' && input.sectionId !== undefined) {
        setSectionSortMode(input.sectionId, previousSortMode);
      }
      setBatchError('failed');
      return;
    }
    setChannelSelection({ ids: [], anchorId: undefined });
    const count = input.channelIds.length;
    if (input.action === 'hide') {
      offerUndo(t('undo.hiddenMany', { count }), () => unhideChannels(input.channelIds));
    } else if (input.action === 'move') {
      offerUndo(t('undo.movedMany', { count, section: sectionName(input.sectionId) }), () =>
        restoreSections(priorSections),
      );
    }
  };

  const restoreSections = async (prior: ReadonlyMap<string, string | undefined>): Promise<void> => {
    const groups = new Map<string | undefined, string[]>();
    for (const [channelId, sectionId] of prior)
      groups.set(sectionId, [...(groups.get(sectionId) ?? []), channelId]);
    for (const [sectionId, channelIds] of groups)
      await actions.batchRoster({
        action: 'move',
        channelIds,
        ...(sectionId === undefined ? {} : { sectionId }),
      });
  };

  const commitBulkPin = (ids: readonly string[], targetPinned: boolean): Promise<void> =>
    commitBulkChange({
      action: targetPinned ? 'pin' : 'unpin',
      channelIds: ids,
    });

  const commitBulkHide = (ids: readonly string[]): Promise<void> =>
    commitBulkChange({ action: 'hide', channelIds: ids });

  const commitBulkMove = (
    ids: readonly string[],
    targetSectionId: string | undefined,
  ): Promise<void> =>
    commitBulkChange({
      action: 'move',
      channelIds: ids,
      ...(targetSectionId === undefined ? {} : { sectionId: targetSectionId }),
    });

  const activateChannel = (
    channel: ChannelSummary,
    event: ReactMouseEvent<HTMLButtonElement>,
  ): void => {
    const gesture: ChannelSelectionGesture = event.shiftKey
      ? 'range'
      : event.ctrlKey || event.metaKey
        ? 'toggle'
        : 'plain';
    setChannelSelection((current) =>
      selectChannels(
        reconcileChannelSelection(current, visibleChannelIds),
        visibleChannelIds,
        channel.id,
        gesture,
      ),
    );
    if (gesture !== 'plain') return;
    void (channel.botSlug === undefined
      ? actions.openChannel(channel.id)
      : actions.openBot(channel.botSlug));
  };

  const openQuickSwitcherEntry = ({ channel }: QuickSwitcherEntry): void => {
    setQuickSwitcherOpen(false);
    setChannelSelection((current) =>
      selectChannels(
        reconcileChannelSelection(current, visibleChannelIds),
        visibleChannelIds,
        channel.id,
        'plain',
      ),
    );
    void (channel.botSlug === undefined
      ? actions.openChannel(channel.id)
      : actions.openBot(channel.botSlug));
  };

  const openChannelMenu = (request: ChannelMenuRequest): void => {
    const inSelection = selectedChannelSet.has(request.channelId);
    const channelIds =
      inSelection && selectedChannelIds.length > 1 ? selectedChannelIds : [request.channelId];
    if (!inSelection) setChannelSelection({ ids: [], anchorId: request.channelId });
    setMenuOpen(false);
    setSortMenuOpen(false);
    setSectionMenuId(undefined);
    setSectionCreateMenuId(undefined);
    setSectionContextMenu(undefined);
    setMenuModelError(undefined);
    setChannelMenu({ ...request, channelIds });
  };

  const startPinDrag = (channelId: string, source: PinDragState['source']): void => {
    if (pinZoneArmTimer.current !== undefined) window.clearTimeout(pinZoneArmTimer.current);
    setPinDrag({ channelId, source });
    if (source === 'roster' && hasPinnedChannels) return;
    pinZoneArmTimer.current = window.setTimeout(() => {
      pinZoneArmTimer.current = undefined;
      if (source === 'roster') setPinZoneArmed(true);
      else setUnpinZoneArmed(true);
    }, 0);
  };

  const endPinDrag = (): void => {
    if (pinZoneArmTimer.current !== undefined) window.clearTimeout(pinZoneArmTimer.current);
    pinZoneArmTimer.current = undefined;
    setPinDrag(undefined);
    setPinZoneArmed(false);
    setPinReorderTarget(undefined);
    setPinZoneHovered(false);
    setUnpinZoneArmed(false);
    setUnpinZoneHovered(false);
  };

  const commitPinDrop = (pinned: boolean): void => {
    if (pinDrag === undefined) return;
    if (pinned ? pinDrag.source !== 'roster' : pinDrag.source !== 'pinned') return;
    void actions.setChannelPinned(pinDrag.channelId, pinned);
    endPinDrag();
  };

  const commitPinnedReorder = (
    sourceId: string,
    targetId: string,
    half: 'before' | 'after',
  ): void => {
    const order = moveWithinOrder(orderedPinnedIds, sourceId, targetId, half);
    if (order === undefined) return;
    setBatchError(undefined);
    void actions
      .reorderPinnedChannels(order, () => {
        setSectionSortMode(PINNED_SORT_SCOPE_ID, 'manual');
      })
      .then((succeeded) => {
        if (!succeeded) setBatchError('reorder');
      });
    endPinDrag();
  };

  const {
    active: channelDragActive,
    propsFor: channelDragProps,
    scopePropsFor: channelScopeDropProps,
    gapPropsFor: channelGapDropProps,
    clearGapHover,
  } = useChannelDrag(commitChannelDrag, commitChannelScopeDrop, commitChannelGapDrop);
  const { active: sectionDragActive, propsFor: sectionDragProps } =
    useSectionDrag(commitSectionDrag);
  dragActiveRef.current = channelDragActive || sectionDragActive;

  const renderChannelRow = (channel: ChannelSummary, scopeId: ScopeId): ReactElement => {
    const drag = channelDragProps(scopeId, channel.id);
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    const preview = channelPreview(channel, botBySlug, t);
    if (channel.type === 'dm' && bot !== undefined) {
      return (
        <BotRow
          t={t}
          key={channel.id}
          bot={bot}
          channel={channel}
          preview={preview}
          unread={channelUnread[channel.id] ?? 0}
          muted={mutedChannelSet.has(channel.id)}
          activity={personaBotActivity(state, bot)}
          selected={selectedBot === bot.slug || selectedChannel === channel.id}
          multiSelected={selectedChannelSet.has(channel.id)}
          onActivate={(event) => activateChannel(channel, event)}
          shortcut={shortcutFor(channel.id)}
          showShortcutHints={showShortcutHints}
          drag={drag}
          onMenu={openChannelMenu}
          onPinDragStart={(channelId) => startPinDrag(channelId, 'roster')}
          onPinDragEnd={endPinDrag}
        />
      );
    }
    return (
      <ChannelRow
        t={t}
        key={channel.id}
        channel={channel}
        bots={botBySlug}
        preview={preview}
        unread={channelUnread[channel.id] ?? 0}
        muted={mutedChannelSet.has(channel.id)}
        selected={selectedChannel === channel.id}
        multiSelected={selectedChannelSet.has(channel.id)}
        onActivate={(event) => activateChannel(channel, event)}
        shortcut={shortcutFor(channel.id)}
        showShortcutHints={showShortcutHints}
        drag={drag}
        onMenu={openChannelMenu}
        onPinDragStart={(channelId) => startPinDrag(channelId, 'roster')}
        onPinDragEnd={endPinDrag}
      />
    );
  };

  if (!wide) {
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
          selected={
            selectedChannel === channel.id || (bot !== undefined && selectedBot === bot.slug)
          }
          summary={channelPreview(channel, botBySlug, t)}
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
        <div className="bh-rail-group">
          {railPinnedChannels.map((channel) => renderRailChannel(channel))}
        </div>
        {railPinnedChannels.length > 0 && railChannels.length > 0 ? (
          <span className="bh-rail-divider" aria-hidden="true" />
        ) : null}

        <div className="bh-rail-group">
          {railChannels.map((channel) => renderRailChannel(channel))}
        </div>
      </div>
    );
  }

  const createSectionId =
    createRequest?.kind === 'channel' || createRequest?.kind === 'bot'
      ? createRequest.sectionId
      : undefined;
  const createSection =
    createSectionId === undefined
      ? undefined
      : state.roster.sections.find((section) => section.id === createSectionId);

  const resolveGapTarget = (
    root: HTMLElement,
    clientY: number,
  ): { sectionId: string; half: 'before' | 'after' } | null => {
    const band = 12;
    const blocks = [...root.querySelectorAll('.bh-section[data-section-id]')]
      .map((element) => ({
        id: element.getAttribute('data-section-id') ?? '',
        top: element.getBoundingClientRect().top,
        bottom: element.getBoundingClientRect().bottom,
      }))
      .filter((block) => block.id !== '');
    for (const block of blocks) {
      if (clientY >= block.top - band && clientY < block.top) {
        return { sectionId: block.id, half: 'before' };
      }
      if (clientY >= block.bottom && clientY < block.bottom + band) {
        return { sectionId: block.id, half: 'after' };
      }
    }
    return null;
  };

  const header = (
    <div className="bh-header">
      {!headerTarget && (
        <span className={`bh-header-label${searchOpen ? ' bh-header-label-hidden' : ''}`}>
          {t('roster.messages')}
        </span>
      )}
      <div className={`bh-search-slot${searchOpen ? ' bh-search-slot-open' : ''}`}>
        <div
          ref={searchMount}
          className={`bh-search${searchOpen ? ' bh-search-open' : ''}`}
          onClick={() => {
            setMenuOpen(false);
            setSortMenuOpen(false);
            setSearchOpen(true);
            searchInput.current?.focus();
          }}
        >
          <Tooltip
            label={t('roster.search.label')}
            side="bottom"
            delayMs={500}
            disabled={searchOpen}
          >
            <button
              type="button"
              className="bh-search-btn"
              aria-label={t('roster.search.label')}
              aria-expanded={searchOpen}
              onClick={() => {
                setMenuOpen(false);
                setSortMenuOpen(false);
                setSearchOpen(true);
              }}
            >
              <IconSearchOutlineRegular size={searchOpen ? 11 : 14} />
            </button>
          </Tooltip>
          <input
            ref={searchInput}
            className="bh-search-input"
            type="text"
            placeholder={t('roster.search.placeholder')}
            value={state.query}
            tabIndex={searchOpen ? 0 : -1}
            onChange={(event) => store.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              store.setQuery('');
              setSearchOpen(false);
            }}
          />
          {searchOpen ? (
            <button
              type="button"
              className="bh-clear-btn"
              aria-label={t('roster.search.clear')}
              onClick={(event) => {
                event.stopPropagation();
                store.setQuery('');
                setSearchOpen(false);
              }}
            >
              <IconCloseFillRegular />
            </button>
          ) : null}
        </div>
      </div>
      <div className={`bh-header-actions${searchOpen ? ' bh-header-actions-hidden' : ''}`}>
        <Menu
          open={sortMenuOpen}
          portal
          dense
          align="end"
          anchor={
            <Tooltip label={t('roster.menu.label')} side="bottom" delayMs={500}>
              <button
                type="button"
                className="bh-icon-btn"
                aria-label={t('roster.menu.label')}
                onClick={() => {
                  setSortMenuOpen((value) => !value);
                }}
              >
                <IconEllipsisOutlineRegular size={16} />
              </button>
            </Tooltip>
          }
          items={globalSortMenuItems(t, {
            hasUnread: Object.keys(channelUnread).length > 0,
          })}
          selectedId={prefs.sortMode}
          onSelect={selectSortMenu}
          onClose={() => {
            setSortMenuOpen(false);
          }}
        />
        <Menu
          open={menuOpen}
          portal
          dense
          align="end"
          anchor={
            <Tooltip label={t('roster.new.label')} side="bottom" delayMs={500}>
              <button
                type="button"
                className="bh-icon-btn"
                aria-label={t('roster.new.label')}
                onClick={() => {
                  setMenuOpen((value) => !value);
                }}
              >
                <IconPlusOutlineRegular size={16} />
              </button>
            </Tooltip>
          }
          items={menuItems(t, gitReady(state.git))}
          onSelect={selectMenu}
          onClose={() => {
            setMenuOpen(false);
          }}
        />
      </div>
      {headerEnd}
    </div>
  );
  return (
    <div
      ref={rosterMount}
      className="bh-root bh-region"
      data-bh-tour="roster"
      onDragOver={(event) => {
        if (!channelDragActive) return;
        const target = event.target as HTMLElement | null;
        if (target !== null && target.closest('.bh-section, [data-channel-id]') !== null) return;
        const resolved = resolveGapTarget(event.currentTarget, event.clientY);
        if (resolved === null) {
          clearGapHover();
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        channelGapDropProps(resolved.sectionId).hover(resolved.half);
      }}
      onDrop={(event) => {
        if (!channelDragActive) return;
        const target = event.target as HTMLElement | null;
        if (target !== null && target.closest('.bh-section, [data-channel-id]') !== null) return;
        const resolved = resolveGapTarget(event.currentTarget, event.clientY);
        if (resolved === null) return;
        event.preventDefault();
        channelGapDropProps(resolved.sectionId).drop(resolved.half);
      }}
    >
      <span ref={createFromWelcome} hidden aria-hidden="true" />
      {state.activitySync === 'stale' ? (
        <div className="bh-activity-stale" role="status" data-activity-stale>
          {t('roster.activityStale')}
        </div>
      ) : null}
      <GitUnavailableNotice
        git={state.git}
        onInstall={() => {
          void actions.installGit();
        }}
        onRecheck={() => {
          void actions.refreshGit();
        }}
        t={t}
      />
      {headerTarget ? createPortal(header, headerTarget) : header}
      {state.status === 'loading' && state.bots.length === 0 ? (
        <LoadingSkeleton kind="roster" label={t('roster.loading')} />
      ) : null}
      {state.status === 'error' && state.error !== undefined ? (
        <div className="bh-error">{t('roster.error', { error: state.error })}</div>
      ) : null}
      {state.roster.readOnly ? <div className="bh-note">{t('roster.readOnly')}</div> : null}
      {state.status === 'ready' && state.bots.length === 0 ? (
        <PanelEmptyState
          icon="hash"
          action={
            <Button
              variant="outline"
              size="sm"
              disabled={!gitReady(state.git)}
              onClick={() => setCreateRequest({ kind: 'bot', source: 'empty' })}
            >
              {t('roster.empty.create')}
            </Button>
          }
        >
          {t('roster.empty')}
        </PanelEmptyState>
      ) : null}
      {visibleCount === 0 && (state.bots.length > 0 || state.channels.length > 0) ? (
        <PanelEmptyState icon="hash">
          {query.length === 0 && hiddenItems.length > 0 ? t('hidden.all') : t('roster.noMatch')}
        </PanelEmptyState>
      ) : null}
      {batchError !== undefined ? (
        <div className="bh-error">
          {t(
            batchError === 'limit'
              ? 'bulk.limit'
              : batchError === 'reorder'
                ? 'pin.reorderFailed'
                : 'bulk.failed',
          )}
        </div>
      ) : null}
      {hasPinnableChannels ? (
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
            <div className="bh-pinned-grid">
              <div className="bh-pinned-header">
                <span>{t('pin.title')}</span>
                <Menu
                  open={pinSortMenuOpen}
                  portal
                  dense
                  align="end"
                  anchor={
                    <button
                      type="button"
                      className="bh-row-action"
                      aria-label={t('pin.sort')}
                      onClick={() => setPinSortMenuOpen((value) => !value)}
                    >
                      <IconEllipsisOutlineRegular />
                    </button>
                  }
                  items={pinnedSortMenuItems(t)}
                  selectedId={sectionSortMode(prefs, PINNED_SORT_SCOPE_ID)}
                  onSelect={selectPinnedSortMenu}
                  onClose={() => setPinSortMenuOpen(false)}
                />
              </div>
              {pinnedChannels.map((channel) => {
                const bot =
                  channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
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
                    <button
                      type="button"
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
                        if (pinDrag?.source !== 'pinned' || pinDrag.channelId === channel.id)
                          return;
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
                        if (pinDrag?.source !== 'pinned' || pinDrag.channelId === channel.id)
                          return;
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
                      {bot === undefined ? (
                        <GroupChannelIcon
                          channel={channel}
                          bots={botBySlug}
                          className="bh-pinned-channel-icon"
                          groupClassName="bh-group-pinned-channel-icon"
                          size={54}
                          hashSize={24}
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
                          state={personaBotActivity(state, bot)}
                          activity={bot.activity}
                          attention={bot.attention}
                          size={54}
                          indicator={false}
                        />
                      )}
                      <span className="bh-name">
                        {bot?.displayName ?? channel.name}
                        {bot === undefined ? null : (
                          <PersonaBotStatusBadges
                            state={personaBotActivity(state, bot)}
                            attention={bot.attention}
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
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
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
      <div className="bh-roster-list">
        {flatBlocks.map((block) => {
          if (block.kind === 'loose') {
            const key = `loose:${block.channels.map((channel) => channel.id).join(',')}`;
            return (
              <div key={key} className="bh-section bh-loose">
                <div
                  className="bh-list-area"
                  onDragOver={(event) => {
                    if (!channelDragActive) return;
                    const target = event.target as HTMLElement | null;
                    if (target !== null && target.closest('[data-channel-id]') !== null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    const rows = [...event.currentTarget.querySelectorAll('[data-channel-id]')].map(
                      (element, index) => {
                        const rect = element.getBoundingClientRect();
                        return {
                          id: block.channels[index]?.id ?? '',
                          top: rect.top,
                          height: rect.height,
                        };
                      },
                    );
                    const resolution = resolveBlockDropTarget(
                      rows.filter((row) => row.id !== ''),
                      Number.NEGATIVE_INFINITY,
                      event.clientY,
                    );
                    if (resolution.kind === 'row') {
                      channelDragProps(undefined, resolution.channelId).hover(resolution.half);
                    }
                  }}
                  onDrop={(event) => {
                    if (!channelDragActive) return;
                    const target = event.target as HTMLElement | null;
                    if (target !== null && target.closest('[data-channel-id]') !== null) return;
                    event.preventDefault();
                    const rows = [...event.currentTarget.querySelectorAll('[data-channel-id]')].map(
                      (element, index) => {
                        const rect = element.getBoundingClientRect();
                        return {
                          id: block.channels[index]?.id ?? '',
                          top: rect.top,
                          height: rect.height,
                        };
                      },
                    );
                    const resolution = resolveBlockDropTarget(
                      rows.filter((row) => row.id !== ''),
                      Number.NEGATIVE_INFINITY,
                      event.clientY,
                    );
                    if (resolution.kind === 'row') {
                      event.stopPropagation();
                      channelDragProps(undefined, resolution.channelId).drop(resolution.half);
                    }
                  }}
                >
                  {block.channels.map((channel) => renderChannelRow(channel, undefined))}
                </div>
              </div>
            );
          }
          const { section, channels: sectionChannels } = block;
          const sectionIndex = state.roster.sections.findIndex((item) => item.id === section.id);
          const collapsed = state.config.collapsed[section.id] === true;
          const menuOpenForSection = sectionMenuId === section.id;
          const createMenuOpenForSection = sectionCreateMenuId === section.id;
          const sectionDrag = sectionDragProps(section.id);
          const channelGap = channelGapDropProps(section.id);
          const channelScope = channelScopeDropProps(section.id);
          const before = sectionDrag.marker === 'before' || channelGap.marker === 'before';
          const after = sectionDrag.marker === 'after' || channelGap.marker === 'after';
          const blockMarkerClass = `${before ? ' bh-drop-before' : ''}${after ? ' bh-drop-after' : ''}${channelScope.hovered ? ' bh-drop-scope' : ''}`;
          const resolveBlockTarget = (element: HTMLElement, clientY: number) => {
            const rows = [...element.querySelectorAll('[data-channel-id]')].map((row, index) => {
              const rect = row.getBoundingClientRect();
              return {
                id: sectionChannels[index]?.id ?? '',
                top: rect.top,
                height: rect.height,
              };
            });
            const headBottom =
              element.querySelector('.bh-section-head')?.getBoundingClientRect().bottom ?? clientY;
            return resolveBlockDropTarget(
              rows.filter((row) => row.id !== ''),
              headBottom,
              clientY,
            );
          };
          const openSectionContextMenu = (x: number, y: number): void => {
            setMenuOpen(false);
            setSortMenuOpen(false);
            setSectionMenuId(undefined);
            setSectionCreateMenuId(undefined);
            setChannelMenu(undefined);
            setSectionContextMenu({ sectionId: section.id, x, y });
          };
          return (
            <div
              key={section.id}
              data-section-id={section.id}
              className={`bh-section${blockMarkerClass}`}
              onContextMenu={(event) => {
                const target = event.target as HTMLElement | null;
                if (target !== null && target.closest('[data-channel-id]') !== null) return;
                event.preventDefault();
                event.stopPropagation();
                openSectionContextMenu(event.clientX, event.clientY);
              }}
              onDragOver={(event) => {
                if (sectionDrag.active) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  sectionDrag.hover(
                    rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()),
                  );
                  return;
                }
                if (!channelDragActive) return;
                const target = event.target as HTMLElement | null;
                if (target !== null && target.closest('[data-channel-id]') !== null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const resolution = resolveBlockTarget(event.currentTarget, event.clientY);
                if (resolution.kind === 'scope') channelScope.hover();
                else channelDragProps(section.id, resolution.channelId).hover(resolution.half);
              }}
              onDrop={(event) => {
                if (sectionDrag.active) {
                  event.preventDefault();
                  event.stopPropagation();
                  sectionDrag.drop(
                    rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()),
                  );
                  return;
                }
                if (!channelDragActive) return;
                const target = event.target as HTMLElement | null;
                if (target !== null && target.closest('[data-channel-id]') !== null) return;
                event.preventDefault();
                event.stopPropagation();
                const resolution = resolveBlockTarget(event.currentTarget, event.clientY);
                if (resolution.kind === 'scope') channelScope.drop();
                else channelDragProps(section.id, resolution.channelId).drop(resolution.half);
              }}
            >
              <div className="bh-list-area">
                <div
                  className={`bh-section-head${menuOpenForSection || createMenuOpenForSection || sectionContextMenu?.sectionId === section.id ? ' bh-menu-open' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={!collapsed}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', section.id);
                    sectionDrag.start();
                  }}
                  onDragEnd={sectionDrag.end}
                  onClick={() => toggleSection(section.id)}
                  onKeyDown={(event) => {
                    const keyboardMenu =
                      event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
                    if (keyboardMenu) {
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      openSectionContextMenu(rect.left + 8, rect.bottom);
                      return;
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggleSection(section.id);
                    }
                  }}
                >
                  <span className="bh-section-name">{section.name}</span>
                  <IconChevronDownOutlineRegular
                    size={14}
                    className={
                      collapsed ? 'bh-section-chevron bh-chevron-collapsed' : 'bh-section-chevron'
                    }
                  />
                  <span className="bh-section-count">{sectionChannels.length}</span>
                  <span className="bh-row-actions">
                    <Menu
                      open={menuOpenForSection}
                      portal
                      dense
                      align="end"
                      closeOnPointerLeave
                      anchor={
                        <button
                          type="button"
                          className="bh-row-action"
                          aria-label={t('roster.section.sort', {
                            name: section.name,
                          })}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSectionMenuId((value) =>
                              value === section.id ? undefined : section.id,
                            );
                            setSectionCreateMenuId(undefined);
                          }}
                        >
                          <IconEllipsisOutlineRegular />
                        </button>
                      }
                      items={sectionMenuItems(t, {
                        canMoveUp: sectionIndex > 0,
                        canMoveDown: sectionIndex < state.roster.sections.length - 1,
                      })}
                      selectedId={sectionSortMode(prefs, section.id)}
                      onSelect={(id) => selectSectionMenu(section, id)}
                      onClose={() => {
                        setSectionMenuId(undefined);
                      }}
                    />
                    <Menu
                      open={createMenuOpenForSection}
                      portal
                      dense
                      align="end"
                      closeOnPointerLeave
                      anchor={
                        <button
                          type="button"
                          className="bh-row-action"
                          aria-label={t('roster.section.create', {
                            name: section.name,
                          })}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSectionMenuId(undefined);
                            setSectionCreateMenuId((value) =>
                              value === section.id ? undefined : section.id,
                            );
                          }}
                        >
                          <IconPlusOutlineRegular />
                        </button>
                      }
                      items={sectionCreateMenuItems(t, gitReady(state.git))}
                      onSelect={(id) => {
                        setSectionCreateMenuId(undefined);
                        const source = botCreateSource(id);
                        if (source !== undefined) {
                          setCreateRequest({
                            kind: 'bot',
                            source,
                            sectionId: section.id,
                          });
                        }
                        if (id === 'channel') {
                          setCreateRequest({
                            kind: 'channel',
                            sectionId: section.id,
                          });
                        }
                      }}
                      onClose={() => {
                        setSectionCreateMenuId(undefined);
                      }}
                    />
                  </span>
                </div>
                {collapsed
                  ? null
                  : sectionChannels.map((channel) => renderChannelRow(channel, section.id))}
              </div>
            </div>
          );
        })}
      </div>
      {createRequest?.kind === 'bot' && createRequest.source === 'zip' ? (
        <ImportBotZipModal
          t={t}
          actions={actions}
          {...(createSectionId === undefined ? {} : { sectionId: createSectionId })}
          {...(createSection === undefined ? {} : { sectionName: createSection.name })}
          onCancel={() => {
            setCreateRequest(undefined);
          }}
          onImported={() => {
            setCreateRequest(undefined);
          }}
        />
      ) : null}
      {createRequest?.kind === 'bot' && createRequest.source !== 'zip' ? (
        <CreatePersonaBotModal
          t={t}
          actions={actions}
          source={createRequest.source}
          {...(createSectionId === undefined ? {} : { sectionId: createSectionId })}
          {...(createSection === undefined ? {} : { sectionName: createSection.name })}
          onCancel={() => {
            setCreateRequest(undefined);
          }}
          onCreated={() => {
            setCreateRequest(undefined);
          }}
        />
      ) : null}
      {createRequest?.kind === 'marketplace' ? (
        <MarketplaceModal
          t={t}
          actions={actions}
          onClose={() => {
            setCreateRequest(undefined);
          }}
          onInstalled={() => {
            setCreateRequest(undefined);
          }}
        />
      ) : null}
      {createRequest?.kind === 'section' ? (
        <CreateSectionModal
          t={t}
          onCancel={() => {
            setCreateRequest(undefined);
          }}
          onCreate={(name) => {
            const request = createRequest;
            void actions.createSection(name).then((section) => {
              if (section !== undefined && request.moveChannelIds !== undefined) {
                void commitBulkMove(request.moveChannelIds, section.id);
              } else if (section !== undefined && request.moveChannelId !== undefined) {
                commitChannelMenuMove(request.moveChannelId, section.id, request.pinned === true);
              }
              setCreateRequest(undefined);
            });
          }}
        />
      ) : null}
      {createRequest?.kind === 'channel' ? (
        <CreateChannelModal
          t={t}
          key={createSectionId ?? 'root'}
          sectionName={createSection?.name}
          onCancel={() => {
            setCreateRequest(undefined);
          }}
          onCreate={async (name) => {
            const channel = await actions.createGroup(name, createSectionId);
            if (channel === undefined) return;
            setCreateRequest(undefined);
          }}
        />
      ) : null}
      {renameTarget !== undefined ? (
        <SectionRenameModal
          t={t}
          key={renameTarget.id}
          section={renameTarget}
          onCancel={() => {
            setRenameTarget(undefined);
          }}
          onRename={(name) => {
            void actions.renameSection(renameTarget.id, name);
            setRenameTarget(undefined);
          }}
        />
      ) : null}
      {channelRenameTarget !== undefined ? (
        <ChannelRenameModal
          t={t}
          key={channelRenameTarget.id}
          name={channelRenameTarget.name}
          bot={channelRenameTarget.type === 'dm'}
          onCancel={() => {
            setChannelRenameTarget(undefined);
          }}
          onRename={(name) => {
            void actions.renameChannel(channelRenameTarget.id, name);
            setChannelRenameTarget(undefined);
          }}
        />
      ) : null}
      {deleteTarget !== undefined ? (
        <SectionDeleteModal
          t={t}
          section={deleteTarget}
          onCancel={() => {
            setDeleteTarget(undefined);
          }}
          onDelete={() => {
            setSectionSortMode(deleteTarget.id, undefined);
            void actions.removeSection(deleteTarget.id);
            if (createSectionId === deleteTarget.id) setCreateRequest(undefined);
            setDeleteTarget(undefined);
          }}
        />
      ) : null}
      {quickSwitcherOpen ? (
        <QuickSwitcher
          entries={quickSwitcherEntries(state.channels, state.bots, state.roster.hidden)}
          bots={botBySlug}
          activityOf={(bot) => personaBotActivity(state, bot)}
          shortcutBindings={shortcutBindings}
          t={t}
          onOpen={openQuickSwitcherEntry}
          onClose={() => setQuickSwitcherOpen(false)}
        />
      ) : null}
      {channelHistoryOpen ? (
        <ChannelHistory actions={actions} t={t} onClose={() => setChannelHistoryOpen(false)} />
      ) : null}
      {hiddenManagerOpen ? (
        <HiddenChannelsModal
          items={hiddenItems}
          t={t}
          onRestore={(channelId) => {
            void actions.setChannelHidden(channelId, false);
          }}
          onOpen={(channelId) => {
            setHiddenManagerOpen(false);
            void actions.openChannel(channelId);
          }}
          onClose={() => {
            setHiddenManagerOpen(false);
          }}
        />
      ) : null}
      {sectionContextMenu !== undefined && contextSection !== undefined ? (
        <SectionContextMenu
          menu={sectionContextMenu}
          index={contextSectionIndex}
          count={state.roster.sections.length}
          selectedId={sectionSortMode(prefs, contextSection.id)}
          t={t}
          onSelect={(id) => selectSectionMenu(contextSection, id)}
          onClose={() => {
            setSectionContextMenu(undefined);
          }}
        />
      ) : null}
      <span ref={menuModelMount} aria-hidden="true" style={{ display: 'contents' }} />
      {channelMenu !== undefined && (channelMenu.channelIds?.length ?? 0) > 1 ? (
        <BulkChannelMenu
          menu={channelMenu}
          sections={state.roster.sections}
          itemsLabel={selectedItems}
          allPinned={(channelMenu.channelIds ?? []).every((id) => allPinnedChannelSet.has(id))}
          t={t}
          onCreateSection={() => {
            setCreateRequest({
              kind: 'section',
              moveChannelIds: channelMenu.channelIds ?? [],
            });
            setChannelMenu(undefined);
          }}
          onPin={(pinned) => void commitBulkPin(channelMenu.channelIds ?? [], pinned)}
          onHide={() => void commitBulkHide(channelMenu.channelIds ?? [])}
          onPick={(sectionId) => void commitBulkMove(channelMenu.channelIds ?? [], sectionId)}
          onClose={() => setChannelMenu(undefined)}
        />
      ) : channelMenu !== undefined ? (
        <ChannelMoveMenu
          menu={channelMenu}
          sections={state.roster.sections}
          currentSectionId={sectionOfChannel(channelMenu.channelId)}
          pinned={channelMenu.pinnedView === true}
          t={t}
          readAction={
            (channelUnread[channelMenu.channelId] ?? 0) > 0
              ? {
                  label: t('roster.markRead'),
                  run: () => {
                    void actions.markChannelRead(channelMenu.channelId).catch((error: unknown) => {
                      console.warn('botharness: mark read failed', error);
                    });
                    setChannelMenu(undefined);
                  },
                }
              : undefined
          }
          muteAction={(() => {
            const muted = mutedChannelSet.has(channelMenu.channelId);
            return {
              label: t(muted ? 'roster.unmute' : 'roster.mute'),
              muted,
              run: () => {
                void actions.setChannelMuted(channelMenu.channelId, !muted);
                setChannelMenu(undefined);
              },
            };
          })()}
          profileAction={
            menuBotSlug === undefined
              ? undefined
              : () => {
                  setChannelMenu(undefined);
                  if (onViewProfile) onViewProfile(menuBotSlug);
                  else void actions.openBot(menuBotSlug, 'profile');
                }
          }
          settingsAction={(() => {
            const channel = state.channels.find(
              (candidate) => candidate.id === channelMenu.channelId,
            );
            if (channel === undefined || !hasChannelSettings(channelSidebar, channel))
              return undefined;
            return {
              attention: channelSettings.attentionOf(channel.id).length > 0,
              run: () => {
                setChannelMenu(undefined);
                void openChannelSettings(channel);
              },
            };
          })()}
          nicknameAction={(() => {
            const channel = state.channels.find(
              (candidate) => candidate.id === channelMenu.channelId,
            );
            if (channel?.humanNickname === undefined) return undefined;
            return () => {
              setNicknameTarget(channel);
              setChannelMenu(undefined);
            };
          })()}
          dmActions={(() => {
            const botSlug = state.channels.find(
              (candidate) => candidate.id === channelMenu.channelId && candidate.type === 'dm',
            )?.botSlug;
            if (botSlug === undefined) return undefined;
            return {
              hidden: menuHiddenDmActions,
              toggle: (kind: DmActionKind) => toggleHiddenDmAction(botSlug, kind),
            };
          })()}
          modelAction={
            menuBotSlug === undefined
              ? undefined
              : {
                  groups: botModelMenuGroups(
                    menuModelData?.state.plan?.orchestrator ?? menuModelData?.catalog.default,
                    menuModelData?.catalog,
                    t('modelPreset.providerDefault'),
                  ),
                  disabled: menuModelBusy || menuModelData === undefined,
                  apply: applyMenuModel,
                }
          }
          shareAction={(() => {
            const botId = state.channels.find(
              (channel) => channel.id === channelMenu.channelId && channel.type === 'dm',
            )?.botSlug;
            const bot = state.bots.find((item) => item.slug === botId);
            if (bot === undefined || bot.deleted === true) return undefined;
            return {
              label: t('profile.share'),
              run: () => {
                setSharing(bot);
                setChannelMenu(undefined);
              },
            };
          })()}
          deleteAction={(() => {
            const botId = state.channels.find(
              (channel) => channel.id === channelMenu.channelId && channel.type === 'dm',
            )?.botSlug;
            const bot = state.bots.find((item) => item.slug === botId);
            if (bot === undefined || bot.deleted === true) return undefined;
            return {
              label: t('deletion.title'),
              run: () => {
                setDeleting(bot);
                setChannelMenu(undefined);
              },
            };
          })()}
          companionAction={(() => {
            const botId = state.channels.find(
              (channel) => channel.id === channelMenu.channelId,
            )?.botSlug;
            if (botId === undefined || companion === undefined || !companion.getSnapshot().ready)
              return undefined;
            const selected = companion.get(botId) !== undefined;
            return {
              label: t(selected ? 'companion.remove' : 'companion.show'),
              run: () => {
                if (selected) companion.remove(botId);
                else companion.select(botId);
                setChannelMenu(undefined);
              },
            };
          })()}
          onSetPinned={(channelId, pinned) => {
            void actions.setChannelPinned(channelId, pinned);
            setChannelMenu(undefined);
          }}
          onRename={(channelId) => {
            const channel = state.channels.find((candidate) => candidate.id === channelId);
            if (channel !== undefined) setChannelRenameTarget(channel);
            setChannelMenu(undefined);
          }}
          onCreateSection={(channelId) => {
            setCreateRequest({
              kind: 'section',
              moveChannelId: channelId,
              pinned: channelMenu.pinnedView === true,
            });
            setChannelMenu(undefined);
          }}
          onHide={(channelId) => {
            void actions.setChannelHidden(channelId, true).then((succeeded) => {
              if (succeeded)
                offerUndo(t('undo.hidden', { name: conversationName(channelId) }), () =>
                  actions.setChannelHidden(channelId, false),
                );
            });
            setChannelMenu(undefined);
          }}
          onPick={(targetSectionId) => {
            commitChannelMenuMove(
              channelMenu.channelId,
              targetSectionId,
              channelMenu.pinnedView === true,
            );
            setChannelMenu(undefined);
          }}
          onClose={() => {
            setChannelMenu(undefined);
          }}
        />
      ) : null}
      {nicknameTarget === undefined ? null : (
        <NicknameDialog
          key={nicknameTarget.id}
          channel={nicknameTarget}
          actions={actions}
          t={t}
          onClose={() => setNicknameTarget(undefined)}
        />
      )}
      {sharing === undefined ? null : (
        <BotZipShareDialog
          key={sharing.slug}
          bot={sharing}
          actions={actions}
          t={t}
          onClose={() => setSharing(undefined)}
        />
      )}
      {deleting === undefined ? null : (
        <PersonaBotDeletionView
          key={deleting.slug}
          slug={deleting.slug}
          actions={actions}
          t={t}
          onClose={() => setDeleting(undefined)}
        />
      )}
      {menuModelError === undefined ? null : (
        <Toast
          key="menu-model-error"
          text={menuModelError}
          holdMs={6000}
          onDone={() => setMenuModelError(undefined)}
        />
      )}
      {undoToast === undefined ? null : (
        <Toast
          key={undoToast.seq}
          text={undoToast.text}
          holdMs={6000}
          actions={[
            {
              label: t('undo.action'),
              onClick: () => {
                const { undo } = undoToast;
                setUndoToast(undefined);
                void undo();
              },
            },
          ]}
          onDone={() =>
            setUndoToast((current) => (current?.seq === undoToast.seq ? undefined : current))
          }
        />
      )}
    </div>
  );
}

export function SectionContextMenu({
  menu,
  index,
  count,
  selectedId,
  t,
  onSelect,
  onClose,
}: {
  menu: SectionMenuRequest;
  index: number;
  count: number;
  selectedId: string;
  t: BotHarnessTranslate;
  onSelect: (id: string) => void;
  onClose: () => void;
}): ReactElement {
  const proxy = useRef<HTMLSpanElement | null>(null);
  return (
    <span hidden>
      <PointerMenu
        point={menu}
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        items={sectionMenuItems(t, {
          canMoveUp: index > 0,
          canMoveDown: index >= 0 && index < count - 1,
        })}
        selectedId={selectedId}
        onSelect={onSelect}
        onClose={onClose}
      />
    </span>
  );
}

export function BulkChannelMenu({
  menu,
  sections,
  allPinned = false,
  itemsLabel,
  t,
  onCreateSection,
  onPin,
  onHide,
  onPick,
  onClose,
}: {
  menu: ChannelMenuRequest;
  sections: readonly RosterSection[];
  allPinned?: boolean;
  itemsLabel: string;
  t: BotHarnessTranslate;
  onCreateSection: () => void;
  onPin: (pinned: boolean) => void;
  onHide: () => void;
  onPick: (sectionId: string | undefined) => void;
  onClose: () => void;
}): ReactElement {
  const proxy = useRef<HTMLSpanElement | null>(null);
  const menuMount = useMountedResource<HTMLSpanElement>(() => {
    const timer = window.setTimeout(() => {
      const lists = document.querySelectorAll<HTMLElement>('div[role="menu"]');
      lists
        .item(lists.length - 1)
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const items: readonly MenuEntry[] = [
    {
      id: allPinned ? 'unpin' : 'pin',
      label: t(allPinned ? 'bulk.unpin' : 'bulk.pin', { items: itemsLabel }),
      icon: allPinned ? <IconPinFillRegular size={16} /> : <IconPinOutlineRegular size={16} />,
    },
    { type: 'separator', id: 'bulk-pin-separator' },
    {
      id: 'move',
      label: t('bulk.move', { items: itemsLabel }),
      icon: <IconFolderOpenOutlineRegular size={16} />,
      submenu: [
        { id: NEW_SECTION_MOVE_TARGET, label: t('move.newSection') },
        ...sections.map((section) => ({ id: section.id, label: section.name })),
        { id: UNGROUPED_MOVE_TARGET, label: t('roster.ungrouped') },
      ],
    },
    { type: 'separator', id: 'bulk-action-separator' },
    {
      id: 'hide',
      label: t('bulk.hide', { items: itemsLabel }),
      icon: <ChannelSidebarIcon name="eye-off" size={16} />,
    },
  ];
  return (
    <span ref={menuMount} hidden>
      <PointerMenu
        point={menu}
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        items={items}
        onSelect={(id) => {
          if (id === 'pin' || id === 'unpin') onPin(id === 'pin');
          else if (id === 'hide') onHide();
          else if (id === NEW_SECTION_MOVE_TARGET) onCreateSection();
          else onPick(id === UNGROUPED_MOVE_TARGET ? undefined : id);
        }}
        onClose={onClose}
      />
    </span>
  );
}

function BotModelMenu({
  label,
  groups,
  disabled,
  open,
  setOpen,
  apply,
}: {
  label: string;
  groups: readonly BotModelGroup[];
  disabled: boolean;
  open: boolean;
  setOpen(open: boolean): void;
  apply(route: ModelRouteView): void;
}): ReactElement {
  const anchor = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState<string>();
  return (
    <span onPointerDown={(event) => event.stopPropagation()}>
      <Menu
        open={open}
        portal
        dense
        autoFocus
        side="right"
        closeOnPointerLeave
        className="bh-model-menu-anchor"
        listClassName="bh-model-menu-list"
        getAnchorRect={() => anchor.current?.closest('button')?.getBoundingClientRect() ?? null}
        anchor={
          <span
            ref={anchor}
            className="bh-move-checked"
            onMouseEnter={() => {
              if (!disabled) setOpen(true);
            }}
          >
            <span className="bh-move-checked-text">{label}</span>
            <IconChevronRightOutlineRegular size={16} />
          </span>
        }
        onClose={() => {
          setOpen(false);
          setActive(undefined);
        }}
      >
        {groups.map((group) => (
          <Menu
            key={group.key}
            open={active === group.key}
            portal
            dense
            side="right"
            closeOnPointerLeave
            className="bh-model-menu-anchor"
            listClassName="bh-model-menu-list"
            anchor={
              <button
                type="button"
                role="menuitem"
                className="bh-sidebar-settings-trigger"
                aria-haspopup="menu"
                aria-expanded={active === group.key}
                disabled={disabled}
                onMouseEnter={() => setActive(group.key)}
                onFocus={() => setActive(group.key)}
                onClick={() => setActive(group.key)}
              >
                <span className="bh-move-checked">
                  <span className="bh-move-checked-text">{group.label}</span>
                  {group.current ? <IconCheckOutlineRegular size={16} /> : null}
                </span>
                <IconChevronRightOutlineRegular size={16} />
              </button>
            }
            onClose={() => setActive(undefined)}
          >
            {group.efforts.map((effort) => (
              <MenuItemButton
                key={effort.route.reasoningEffort ?? ''}
                disabled={disabled}
                onSelect={() => apply(effort.route)}
              >
                <span className="bh-move-checked">
                  <span className="bh-move-checked-text">{effort.label}</span>
                  {effort.current ? <IconCheckOutlineRegular size={16} /> : null}
                </span>
              </MenuItemButton>
            ))}
          </Menu>
        ))}
      </Menu>
    </span>
  );
}

export function ChannelMoveMenu({
  readAction,
  muteAction,
  companionAction,
  shareAction,
  deleteAction,
  settingsAction,
  profileAction,
  nicknameAction,
  dmActions,
  modelAction,
  menu,
  sections,
  currentSectionId,
  pinned = false,
  t,
  onSetPinned,
  onHide,
  onRename,
  onCreateSection,
  onPick,
  onClose,
}: {
  readAction?: { label: string; run(): void } | undefined;
  muteAction?: { label: string; muted: boolean; run(): void } | undefined;
  companionAction?: { label: string; run(): void } | undefined;
  shareAction?: { label: string; run(): void } | undefined;
  deleteAction?: { label: string; run(): void } | undefined;
  settingsAction?: { attention: boolean; run(): void } | undefined;
  profileAction?: (() => void) | undefined;
  nicknameAction?: (() => void) | undefined;
  dmActions?: { hidden: readonly DmActionKind[]; toggle(kind: DmActionKind): void } | undefined;
  modelAction?:
    | {
        groups: readonly BotModelGroup[];
        disabled: boolean;
        apply(route: ModelRouteView): void;
      }
    | undefined;
  menu: ChannelMenuRequest;
  sections: readonly RosterSection[];
  currentSectionId: string | undefined;
  pinned?: boolean;
  t: BotHarnessTranslate;
  onSetPinned?: (channelId: string, pinned: boolean) => void;
  onHide?: (channelId: string) => void;
  onRename?: (channelId: string) => void;
  onCreateSection?: (channelId: string) => void;
  onPick: (sectionId: string | undefined) => void;
  onClose: () => void;
}): ReactElement {
  const [modelOpen, setModelOpen] = useState(false);
  const proxy = useRef<HTMLSpanElement | null>(null);
  const menuMount = useMountedResource<HTMLSpanElement>(() => {
    const timer = window.setTimeout(() => {
      const lists = document.querySelectorAll<HTMLElement>('div[role="menu"]');
      lists
        .item(lists.length - 1)
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);
  const items: readonly MenuEntry[] = [
    ...(profileAction
      ? [
          {
            id: 'profile',
            label: t('profile.view'),
            icon: <ChannelSidebarIcon name="id-card" size={16} />,
          },
        ]
      : []),
    ...(settingsAction === undefined
      ? []
      : [
          channelSettingsItem(t, settingsAction.attention),
          { type: 'separator' as const, id: 'settings-separator' },
        ]),
    ...(companionAction === undefined
      ? []
      : [
          {
            id: 'companion',
            label: companionAction.label,
            icon: <ChannelSidebarIcon name="monitor" size={16} />,
          },
        ]),
    ...(shareAction === undefined
      ? []
      : [
          {
            id: 'share',
            label: shareAction.label,
            icon: <IconShareOutlineRegular size={16} />,
          },
        ]),
    {
      id: pinned ? 'unpin' : 'pin',
      label: t(pinned ? 'pin.remove' : 'pin.add'),
      icon: pinned ? <IconPinFillRegular size={16} /> : <IconPinOutlineRegular size={16} />,
    },
    ...(readAction === undefined
      ? []
      : [
          {
            id: 'mark-read',
            label: readAction.label,
            icon: <IconCheckOutlineRegular size={16} />,
          },
        ]),
    ...(muteAction === undefined
      ? []
      : [
          {
            id: muteAction.muted ? 'unmute' : 'mute',
            label: muteAction.label,
            icon: <ChannelSidebarIcon name={muteAction.muted ? 'bell' : 'bell-off'} size={16} />,
          },
        ]),
    { type: 'separator', id: 'pin-separator' },
    ...(modelAction === undefined
      ? []
      : [
          {
            id: 'bot-model',
            label: (
              <BotModelMenu
                label={t('roster.menu.model')}
                {...modelAction}
                open={modelOpen}
                setOpen={setModelOpen}
              />
            ),
            icon: <IconAgentPresetOutlineRegular size={16} />,
            disabled: modelAction.disabled || modelAction.groups.length === 0,
          },
        ]),
    ...channelMoveMenuItems(t, sections, currentSectionId).map((entry) =>
      'type' in entry ? entry : { ...entry, icon: <IconFolderOpenOutlineRegular size={16} /> },
    ),
    { type: 'separator', id: 'channel-action-separator' },
    {
      id: 'rename',
      label: t('channel.rename'),
      icon: <IconEditOutlineRegular size={16} />,
    },
    ...(nicknameAction === undefined ? [] : [channelNicknameItem(t)]),
    ...(dmActions === undefined ? [] : [dmActionsItem(t, dmActions.hidden)]),
    { type: 'separator', id: 'hide-separator' },
    {
      id: 'hide',
      label: t('hidden.action'),
      icon: <ChannelSidebarIcon name="eye-off" size={16} />,
    },
    ...(deleteAction === undefined
      ? []
      : [
          {
            id: 'delete',
            label: deleteAction.label,
            icon: <IconTrashOutlineRegular size={16} />,
            danger: true,
          },
        ]),
  ];
  return (
    <span ref={menuMount} hidden>
      <PointerMenu
        point={menu}
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        items={items}
        onSelect={(id) => {
          if (id === 'profile') {
            profileAction?.();
            return;
          }
          if (id === 'mark-read') {
            readAction?.run();
            return;
          }
          if (id === 'mute' || id === 'unmute') {
            muteAction?.run();
            return;
          }
          const dmKind = dmActionKindOf(id);
          if (dmKind !== undefined) {
            dmActions?.toggle(dmKind);
            return;
          }
          if (id === 'bot-model') {
            setModelOpen(true);
            return;
          }
          if (id === CHANNEL_SETTINGS_ITEM) {
            settingsAction?.run();
            return;
          }
          if (id === CHANNEL_NICKNAME_ITEM) {
            nicknameAction?.();
            return;
          }
          if (id === 'companion') {
            companionAction?.run();
            return;
          }
          if (id === 'share') {
            shareAction?.run();
            return;
          }
          if (id === 'delete') {
            deleteAction?.run();
            return;
          }
          if (id === 'pin' || id === 'unpin') {
            onSetPinned?.(menu.channelId, id === 'pin');
            return;
          }
          if (id === 'hide') {
            onHide?.(menu.channelId);
            return;
          }
          if (id === 'rename') {
            onRename?.(menu.channelId);
            return;
          }
          if (id === NEW_SECTION_MOVE_TARGET) {
            onCreateSection?.(menu.channelId);
            return;
          }
          onPick(id === UNGROUPED_MOVE_TARGET ? undefined : id);
        }}
        onClose={onClose}
      />
    </span>
  );
}

function botCreateSource(id: string): 'empty' | 'git' | 'zip' | undefined {
  if (id === 'bot' || id === 'bot:empty') return 'empty';
  if (id === 'bot:git') return 'git';
  if (id === 'bot:zip') return 'zip';
  return undefined;
}

function menuItems(t: BotHarnessTranslate, gitAvailable: boolean): MenuEntry[] {
  const disabled = !gitAvailable;
  return [
    {
      id: 'bot',
      label: t('roster.menu.createBot'),
      icon: <IconAgentPresetOutlineRegular size={16} />,
      submenu: [
        { id: 'bot:empty', label: t('roster.menu.createBot.empty'), disabled },
        { id: 'bot:git', label: t('roster.menu.createBot.git'), disabled },
        { id: 'bot:zip', label: t('roster.menu.createBot.zip'), disabled },
      ],
    },
    {
      id: 'channel',
      label: t('roster.menu.createChannel'),
      icon: <IconNewChatOutlineRegular size={16} />,
    },
    {
      id: 'section',
      label: t('roster.menu.createSection'),
      icon: <IconFolderOpenOutlineRegular size={16} />,
    },
    {
      id: 'marketplace',
      label: t('roster.menu.marketplace'),
      icon: <IconGlobeOutlineRegular size={16} />,
    },
  ];
}

function sectionCreateMenuItems(t: BotHarnessTranslate, gitAvailable: boolean): MenuEntry[] {
  return menuItems(t, gitAvailable).filter((item) => item.id === 'bot' || item.id === 'channel');
}
